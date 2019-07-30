package com.carrefour.fr.logm.sparksql;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.apache.spark.sql.DataFrameReader;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.api.ContentProvider;
import org.eclipse.jetty.client.api.ContentResponse;
import org.eclipse.jetty.client.api.Request;
import org.eclipse.jetty.client.util.BytesContentProvider;
import org.eclipse.jetty.client.util.FutureResponseListener;
import org.eclipse.jetty.http.HttpMethod;
import org.json.JSONObject;

import com.typesafe.config.Config;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SourceES extends Source {
    static Logger logger = LoggerFactory.getLogger(SourceES.class);
	private int HTTPCLIENT_ES_TIMEOUT = 30;
	private String ES_NODES_CLIENT_ONLY;
	private  String ES_NODES_WAN_ONLY;
	private  String ES_NODES_DISCOVERY;
	private  String ES_NET_SSL;
	HttpClient httpClient;
	Map<String, JSONObject> indexes = new HashMap<String, JSONObject>();
	
	public SourceES(Config cluster) {
		super(cluster, "elasticsearch");
	    httpClient = new HttpClient(); // new HttpClient(sslContextFactory);
		httpClient.setFollowRedirects(false);
		httpClient.setResponseBufferSize(16*4194304);

		try {
			httpClient.start();
			updateTables();
		} catch (Exception e) {
			e.printStackTrace();
		}
	}
	
	@Override
	public void config(Config es) {
		super.config(es);
		ES_NODES_CLIENT_ONLY = es.getString("es_nodes_client_only");
		ES_NODES_WAN_ONLY = es.getString("es_nodes_wan_only");
		ES_NODES_DISCOVERY = es.getString("es_nodes_discovery");
		ES_NET_SSL = es.getString("es_net_ssl");
	}
	
	@Override
    public void updateTables() throws Exception {
		Request request = httpClient.newRequest(URI.create("http://"+this.hostname+":"+this.port+"/_all/_mapping"));
		FutureResponseListener listener = new FutureResponseListener(request, 64*1024*1024);
		request.send(listener);
		ContentResponse response = listener.get(20, TimeUnit.SECONDS); 
		JSONObject jsonObject = new JSONObject(response.getContentAsString());
		Iterator<String> iterIndexes = jsonObject.keys();
		while (iterIndexes.hasNext()) {
			String index = iterIndexes.next();
			JSONObject mappings = jsonObject.getJSONObject(index).getJSONObject("mappings");
			System.out.println("index:"+index);
			indexes.put(index, mappings);
		}
	}

	@Override
	public List<String> getTables() {
		List<String> tables = new ArrayList<String>();
		indexes.keySet().forEach(tablename -> tables.add(tablename));
		return tables;
	}

	@Override
	public JSONObject getTableColumns(String tablename) throws Exception {
		return indexes.get(tablename);
	}

	@Override
    public void createOrReplaceTempView(SparkSession session, String tablename, String filter, String alias) throws Exception {
		System.out.println("createOrReplaceTempView cluster name:"+this.name+" index:"+tablename+" alias:"+alias+" filter:"+filter);

		DataFrameReader dfreader = session.read()
		    .format("org.elasticsearch.spark.sql")
		    .option("es.nodes", this.hostname)
		    .option("es.port", this.port)
		    .option("es.nodes.wan.only", ES_NODES_WAN_ONLY)
		    .option("es.nodes.discovery", ES_NODES_DISCOVERY)
		    .option("es.nodes.client.only", ES_NODES_CLIENT_ONLY)
		    .option("es.net.ssl", ES_NET_SSL);
		    
	    if (filter!=null) {
	    	// examples:
	    	// select * from local.twitter filter (?q=http_status:200)
	    	// select * from local.twitter filter (?q=http_status:400 OR http_status:200)
	    	// select * from local.twitter filter ({ "query" : { "term" : { "http_status" : "400" } } })
	    	// select * from local.logstash-2015.05.20 filter ({"query": {"range" : {"@timestamp" : {"gte" : "now-1d/d","lt" :  "now/d"}}}})
	    	// select * from local.logstash-2015.05.20 filter ({"query": {"range" : {"@timestamp" : {"gte" : "now-1h"}}}})

	    	dfreader
	    	  .option("es.query", filter)
	    	  .load(tablename).createOrReplaceTempView(alias);
	    } else {
	    	dfreader.load(tablename).createOrReplaceTempView(alias);
	    }
		
		System.out.println("done createOrReplaceTempView index:"+tablename+" alias:"+alias);
    }
	
	@Override
	public String toFilter(String query) throws Exception {
		byte[] bytes = ("{\"query\":\""+query+"\"}").getBytes();
		Request request = httpClient.newRequest(URI.create("http://"+this.hostname+":"+this.port+"/_sql/translate"))
				.method(HttpMethod.POST)
				.content(new BytesContentProvider(bytes), "application/json");
		FutureResponseListener listener = new FutureResponseListener(request, 64*1024*1024);
		request.send(listener);
		ContentResponse response = listener.get(HTTPCLIENT_ES_TIMEOUT, TimeUnit.SECONDS); 
		JSONObject jsonObject = new JSONObject(response.getContentAsString()).put("size", -1);
		System.out.println("filter:"+jsonObject.toString());
		if (jsonObject.has("query")) {
			return jsonObject.toString();
		} else {
			return jsonObject.put("query", new JSONObject("{\"match_all\":{}}")).toString();
		}
	}


	@Override
	public void close() throws Exception {
		httpClient.stop();
	}

}