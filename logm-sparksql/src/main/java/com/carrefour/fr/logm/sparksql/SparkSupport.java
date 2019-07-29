package com.carrefour.fr.logm.sparksql;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.List;
import java.util.Iterator;
import org.apache.spark.sql.SparkSession;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.api.ContentResponse;
import org.eclipse.jetty.client.api.Request;
import org.eclipse.jetty.client.util.FutureResponseListener;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigValue;

import org.apache.commons.lang3.tuple.ImmutablePair;
import org.apache.commons.lang3.tuple.Pair;
import org.apache.spark.sql.Row;
import org.apache.spark.SparkConf;
import org.apache.spark.sql.Dataset;

import org.elasticsearch.spark.sql.*;
import org.apache.spark.api.java.JavaSparkContext;                              
import org.apache.spark.api.java.JavaRDD;
import org.elasticsearch.spark.rdd.api.java.JavaEsSpark; 

import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public class SparkSupport implements AutoCloseable {
    static Logger logger = LoggerFactory.getLogger(SparkSupport.class);
	private  SparkSession spark;
	private  Integer QUERY_LIMIT;
	public  Map<String, Source> sources = new HashMap<String, Source>();
	private  Map<String, Pair<SparkSession, Instant>> sessions = new HashMap<String, Pair<SparkSession, Instant>>();
	private Pattern viewPattern =  Pattern.compile("\\((?<select> *[sS][eE][lL][eE][cC][tT] +[^*].*?) +[fF][rR][oO][mM] +(?<source>[^., ]+).(?<table>[^, )]+)(?<where> +[wW][hH][eE][rR][eE] +.*?)?\\)");
    private Pattern filterPattern = Pattern.compile("([^., ]+)\\.([^, )]+)( +[fF][iI][lL][tT][eE][rR] *\\((.*?)\\))?");

    public SparkSupport(String fetchesId, Config config) {
		QUERY_LIMIT = config.getInt("query_limit");

		// TODO modify config, add sources and for each source add type (ie. elasticsearch, bigquery, ...)
		SparkConf sparkConf = getSparkConf(config.getConfig("sparkConf"));
	    spark = SparkSession.builder().config(sparkConf).getOrCreate();	    
    	Config esconfig = config.getConfig("elasticsearch");
    	Iterator<? extends Config> iter = esconfig.getConfigList("sources").iterator();
    	while (iter.hasNext()) {
    		Source source = new SourceES(iter.next());
    		source.config(esconfig);
    	   sources.put(source.name.toLowerCase(), source);
    	}	
    }
    
	public List<String> runSql(String sessionId, String query) throws Exception {
		String queryWithFilters = addFiltersToQuery(query);
		System.out.println("queryWithFilters: "+queryWithFilters);
		SparkSession session = getSparkSession(sessionId);
		String res = createOrReplaceTempViews(sessionId, session, queryWithFilters);
		System.out.println("run query "+res);
		Dataset<Row> df = session.sql(res);
		return df.toJSON().takeAsList(QUERY_LIMIT);
	}
	
	/*
	 * for each view
	 * view = \\( *select +(?<select>[^*].*?) +from +(?<source>[^., ]+)\\.(?<table>[^, )]+)(?<where> +where +.*?)?\\)
	 *  => translate q=(select <select> from <table><where>) to <filter> (ie. String filter = Source.toFilter(q))
	 *  => replace view by (select <select> from <source>.<table> filter (<filter>))
	 * 
	 */
	private String addFiltersToQuery(String query) throws Exception {
		if (query == null) {
			return query;
		} else {
	    	Matcher m = viewPattern.matcher(query);
	    	if (m.find()) {
	    		String where = m.group("where");
	    		String select = m.group("select");
				String source_name = m.group("source").toLowerCase();
				if (sources.containsKey(source_name)) {
					Source source = sources.get(source_name);
					String tablename = m.group("table");
			    	List<String> tables = getTablesStartWith(source, tablename);
			    	if (tables.size() > 1) {
			    		List<String> queries = new ArrayList<String>();
			    		tables.forEach(table -> {
			    			try {
						    	String filter = source.toFilter(select + " from " + table + (where==null?"":where));
						    	queries.add(select + " from " + source_name + "." + table + " filter (" + filter + ")");
			    			} catch (Exception e) {
			    				// ignore when can't get filter
			    				System.out.println("toFilter failed for "+select + " from " + table + (where==null?"":where)+"\n"+e.getMessage());
			    				queries.add(select + " from " + source_name + "." + table);
			    			}
			    		});
			    	    return query.substring(0, m.start()) + 
								"(" + String.join(" union all ", queries) + ")" + 
								addFiltersToQuery(query.substring(m.end()));
			    	} else {
						String filter = source.toFilter(select + " from " + tablename + (where==null?"":where));
						return query.substring(0, m.start()) + 
								"(" + select + " from " + source_name + "." + tablename + 
								" filter (" + filter + "))" + 
								addFiltersToQuery(query.substring(m.end()));
			    	}
				} else {
					return query.substring(0, m.end()) +  addFiltersToQuery(query.substring(m.end()));
				}
	    	} else {
	    		return query;
	    	}
		}
	}
	
    private String createOrReplaceTempViews(String sessionId, SparkSession session, String query) throws Exception {
		Pair<String, List<TempTable>> res = getTablesFromQuery(query);
		Iterator<TempTable> iter = res.getRight().iterator();
    	while (iter.hasNext()) {
    		TempTable table = iter.next();
    		System.out.println("    tempTable: "+table);
    		String source_name = table.source_name;
    		String index_name = table.table_name;
    		String filter = table.filter;
    		String alias = table.alias;
    		if (sources.containsKey(source_name)) {
				sources.get(source_name).createOrReplaceTempView(session, index_name, filter, alias);
    		} else {
    			throw new Exception("unknown elasticsearch source "+source_name);
    		}
    	}
		return res.getLeft();
    }
    
	private SparkSession getSparkSession(String sessionId) {
		if (sessions.containsKey(sessionId)) {
			return sessions.get(sessionId).getLeft();
		} else {
			SparkSession session = spark.newSession();
			sessions.put(sessionId, new ImmutablePair(session, Instant.now()));
			return session;
		}
	}

    private Pair<String, List<TempTable>> getTablesFromQuery(String query) {
    	return getTablesFromQuery(query.replace('\n', ' '), new ArrayList<TempTable>());
    }
    
    private Pair<String, List<TempTable>> getTablesFromQuery(String query, List<TempTable> tables) {
    	if (query==null) {
    		return new ImmutablePair("", tables);
    	} else {
	    	Matcher m = filterPattern.matcher(query);
        	if (m.find()) {
        		int start = m.start();
        		int end = m.end();
        		String source_name = m.group(1).toLowerCase();
        		String index_name = m.group(2);
                if (sources.containsKey(source_name)) {
                	String filter = m.group(4); 
                	TempTable table = new TempTable(source_name, index_name, filter);
                	tables.add(table);
    	    		Pair<String, List<TempTable>> res = getTablesFromQuery(query.substring(end), tables);
    	    		String newquery = query.substring(0, start) + table.alias + res.getLeft();
                	return new ImmutablePair(newquery, tables);
                } else {
    	    		Pair<String, List<TempTable>> res = getTablesFromQuery(query.substring(end), tables);
                	return new ImmutablePair(query.substring(0, end) + res.getLeft(), tables);                	
                }
        	} else {
        		return new ImmutablePair(query, tables);
        	}
    	}
    }
    
    private List<String> getTablesStartWith(Source source, String index_name) {
		ArrayList<String> indexes = new ArrayList<String>();
		Iterator<String> iter = source.getTables().iterator();
	    while (iter.hasNext()) {
	    	String index = iter.next();
	    	if (index.startsWith(index_name)) {
	    		indexes.add(index);
	    	}
	    }
        return indexes;
    }
        
    private static SparkConf getSparkConf(Config config) {
    	SparkConf sparkConf = new SparkConf();
	    for (Map.Entry<String, ConfigValue> entry : config.entrySet()) {
	        String key = entry.getKey();
	        String value = entry.getValue().unwrapped().toString();
            sparkConf.set(key, value);
	    }
	    return sparkConf;
    }
    
	@Override
	public void close() throws Exception {
		if (spark!=null) spark.stop();
		sessions.values().forEach((session) -> session.getLeft().close());

	}
}

class TempTable {
	private static int gid = 0;
	public String source_name;
	public String table_name;
	public String filter;
	public String alias;
	public TempTable(String source_name, String table_name, String filter) {
		this.source_name=source_name;
		this.table_name=table_name;
		this.filter=filter;
		this.alias = alias();
	}
    private String alias() {
    	return source_name + "_" + table_name.replace('/', '_').replace('.', '_').replace('-', '_')+'_'+(gid++);
    }
    
    public String toString() { 
        return this.source_name + "." + this.table_name + " as " + this.alias + " filter ("+filter+")";
    } 
    
}
