package com.carrefour.fr.logm.sparksql;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.util.thread.QueuedThreadPool;

import com.typesafe.config.Config;

import io.javalin.Javalin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class FetchSQLServer implements AutoCloseable {
	static Logger logger = LoggerFactory.getLogger(FetchSQLServer.class);
    Javalin app;
	SparkSupport spark;

  public FetchSQLServer(Config config) {
	  Config javalinConfig = config.getConfig("javalin");

  	  String fetchesId = UUID.randomUUID().toString();

	  spark = new SparkSupport(fetchesId, config);

	  QueuedThreadPool threadPool = new QueuedThreadPool(
    		  javalinConfig.getInt("maxThreadPool"), 
    		  javalinConfig.getInt("minThreadPool"), 
    		  javalinConfig.getInt("idleTimeout"));

      app = Javalin.create(c -> {
    	  c.addStaticFiles("/public");
          c.server(() -> new Server(threadPool));
      }).start(javalinConfig.getInt("port"));

      app.events(event -> {
          event.serverStarted(() -> { 
          	System.out.println("start server");
          	});
          event.serverStopped(() -> { 
              System.out.println("stopped server");
          	});
      });

    	app.exception(Exception.class, (e, ctx) -> {
    		e.printStackTrace();
    	    ctx.status(404).result(e.getMessage());
    	});
    	
/*     // Set the access-manager that Javalin should use
      app.accessManager((handler, ctx, permittedRoles) -> {
          MyRole userRole = getUserRole(ctx);
          if (permittedRoles.contains(userRole)) {
              handler.handle(ctx);
          } else {
              ctx.status(401).result("Unauthorized");
          }
      });

      Role getUserRole(Context ctx) {
          // determine user role based on request
          // typically done by inspecting headers
      	return MyRole.ANYONE;
      }*/
              
    	FetchooWebsocket.start(app, spark);
}

	@Override
	public void close() throws Exception {
		if (app!=null) app.stop();
		if (spark!=null) spark.close();

	}
}

