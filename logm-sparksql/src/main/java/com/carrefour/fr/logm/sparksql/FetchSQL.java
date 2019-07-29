package com.carrefour.fr.logm.sparksql;

import com.typesafe.config.ConfigFactory;
import com.typesafe.config.Config;

import io.javalin.core.security.Role;
import io.javalin.websocket.WsContext;
import io.javalin.Javalin;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.List;
import java.util.Map;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.UUID;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.util.thread.QueuedThreadPool;

import org.json.JSONObject;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.api.ContentResponse;

import static j2html.TagCreator.*;

public class FetchSQL {
    enum MyRole implements Role {
        ANYONE, ROLE_ONE, ROLE_TWO, ROLE_THREE;
    }
    
	public static void main(String[] args) {
		
	    Config config = ConfigFactory.load();
	    
	    FetchSQLServer fetchESServer = new FetchSQLServer(config);
	    	    
	    Runtime.getRuntime().addShutdownHook(new Thread(() -> {
        	try {
        		fetchESServer.close();
			} catch (Exception e) {
				e.printStackTrace();
			}
        }));
	}
}

class MockUser {
    String name;
    String level;

    MockUser(String name, String level) {
        this.name = name;
        this.level = level;
    }
}

