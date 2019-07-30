package com.carrefour.fr.logm.sparksql;

import static j2html.TagCreator.article;
import static j2html.TagCreator.attrs;
import static j2html.TagCreator.b;
import static j2html.TagCreator.p;
import static j2html.TagCreator.span;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.apache.spark.sql.SparkSession;
import org.json.JSONObject;

import io.javalin.Javalin;
import io.javalin.websocket.WsConnectContext;
import io.javalin.websocket.WsContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

class FetchWebsocket {
    static Logger logger = LoggerFactory.getLogger(FetchWebsocket.class);
    static Map<String, JSONObject> projects = new HashMap<String, JSONObject>();
    // TODO add a mapping between users and contexts
    static List<WsConnectContext> contexts = new ArrayList<WsConnectContext>();
    public static void start(Javalin app, SparkSupport spark) {

        app.ws("/fetch-sql", ws -> {
            ws.onConnect(ctx -> {
            	contexts.add(ctx);
            	if (spark!=null) {
	                spark.sources.forEach((name, source) -> {
	                	String tables = source.getTables().stream()
	                			  .map(tablename -> "\""+tablename+"\"")
	                			  .collect(Collectors.joining(", "));
	                    ctx.send("{\"key\":\"source\",\"data\":{\"type\":\""+source.getSourceType()+"\"hostname\":\""+source.getHostname()+"\",\"port\":\""+source.getPort()+"\"name\":\""+name+"\",\"tables\":["+tables+"]}}");
	                });
            	}
            	// send projects
            	projects.forEach((projectname, project) -> {
            		ctx.send("{\"key\":\"project\",\"data\":"+ project.toString()+"}");
            	});
            });
            
            ws.onClose(ctx -> {
            	System.out.println(ctx.reason());
            	System.out.println("ws connection closed");
            });
            
            ws.onError(errctx -> {
            	System.out.println(errctx.error());
            });
            
            ws.onMessage(ctx -> {
            	System.out.println("received message: "+ctx.message());
            	try {
            		// TODO log users that sent the message
		    		JSONObject msgJson = new JSONObject(ctx.message());
	            	System.out.println("json message: "+msgJson.toString());
	            	String key = msgJson.getString("key");
	            	String data = msgJson.getString("data");
	            	String sessionId = msgJson.getString("sessionId");
		    		switch (key) {
		    		case "project":
		    			JSONObject x = new JSONObject(data);
		    			String projectname = x.getString("projectname");
		    			JSONObject project = x.getJSONObject("project");
		    			projects.put(projectname,  project);
		    			// broadcast project
		    			// TODO many users may be modifying the same project
		    			// TODO client must implement a merge of projects
		    			contexts.forEach(c -> {
		    				if (c.session != ctx.session) {
		    					c.send(ctx.message());
		    				}
		    			});
		    			break;
		    		case "delete":
		    			projects.remove(data);
		    			break;
		    		case "query":
			            Executors.newSingleThreadScheduledExecutor().schedule(() -> {
			        		try {
		        				List<String> result = spark.runSql(sessionId, data);
		        				ctx.send("{\"key\":\"result\",\"data\":"+result+"}");
			        		} catch (Exception e) {
			        			String msg = e.getMessage()==null?"null":e.getMessage();
			        			ctx.send("{\"key\":\"error\",\"data\":{\"message\":\""+msg.replace("\"", "\\\"")+"\",\"stacktrace\":\""+e.getStackTrace()+"\"}}");
			        		}
			            }, 0L, TimeUnit.MILLISECONDS);
			            break;
		    		default: {
		    				ctx.send("{\"key\":\"error\",\"data\":{\"message\":\"request must include sessionId and query fields\"}}");
		    			}
		    		}
            	} catch (Exception e) {
            		ctx.send("{\"key\":\"error\",\"data\":{\"message\":\""+e.getMessage()+"\"}}");
            	}
	        });
        });
    }
}
