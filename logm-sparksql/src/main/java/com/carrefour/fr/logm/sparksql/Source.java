package com.carrefour.fr.logm.sparksql;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.apache.spark.sql.SparkSession;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.api.ContentResponse;
import org.eclipse.jetty.client.api.Request;
import org.eclipse.jetty.client.util.FutureResponseListener;
import org.json.JSONObject;

import com.typesafe.config.Config;

abstract class Source implements AutoCloseable {
    String sourceType;
	String name;
	String hostname;
	int port;
	Config sourceConfig;
	
	public Source(Config cluster, String sourceType) {
		this.sourceType = sourceType;
		this.name = cluster.getString("name");
		this.hostname = cluster.getString("hostname");
		this.port = cluster.getInt("port");
	}
	
	public void config(Config conf) {
		this.sourceConfig = conf;
	};
	public Config getConfig(Config conf) {
		return sourceConfig;
	};
	public String getSourceType() {
		return sourceType;
	}
	public String getHostname() {
		return hostname;
	}
	public int getPort() {
		return port;
	}
	public String getName() {
		return name;
	}
	public abstract String toFilter(String query) throws Exception;
    public abstract void updateTables() throws Exception;
	public abstract List<String> getTables();
	public abstract JSONObject getTableColumns(String tablename) throws Exception;
	public abstract void createOrReplaceTempView(SparkSession session, String tablename, String filter, String alias) throws Exception;
}
