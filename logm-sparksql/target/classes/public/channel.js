"use strict";

function channel(path) {
    var ch = this;
    this.socket = null;
    this.retries = 10;
    this.receivers = {};
    this.sessionId = (Math.random().toString(36).substring(2) + Date.now().toString(36)) + (Math.random().toString(36).substring(2) + Date.now().toString(36));

    
    var wsConnect = function(callback, error, retries=ch.retries) { 
    	if (retries==0) {
    		callback(error);
    	} else {
    		try {
    			ch.socket = new WebSocket("ws://" + location.hostname + ":" + location.port + path);
    			callback(null);
    		} catch (error) {
    			setTimeout(wsConnect, 1000, callback, error, retries-1);
    		}
    	}
    }

    var wsConnectCallback = function (error) {
    	if (error==null) {
    	    ch.socket.onmessage = function (e) {
    	    	try {
	    	        var msg = JSON.parse(e.data);
		            Object.keys(ch.receivers).forEach(
		                function (key) {
		                    if (key == msg.key) {
		                        ch.receivers[key](msg.data);
		                    }
		                });
    	    	} catch (error) {
    	    		console.log(e.data);
    	    		alert(error);
    	    	}
    	    };

    	    ch.socket.onerror = (e) => {
    	    	if (ch.receivers.hasOwnProperty('error')) {
    	    		ch.receivers['error'](e);
    	    	}
    	    }
    	    ch.socket.onopen = (e) => {
    	    	if (ch.receivers.hasOwnProperty('open')) {
    	    		ch.receivers['open'](e);
    	    	}
    	    }
    	    ch.socket.onclose = (e) => {
    	    	if (ch.receivers.hasOwnProperty('close')) {
    	    		ch.receivers['close'](e);
    	    	}
    			wsConnect(wsConnectCallback);	
    		}

    	} else {
    		alert(JSON.stringify(error));
    	}
    };

    this.send = function (key, data) {
        return ch.__send({sessionId: ch.sessionId, key:key, data:data});
    }

    this.__send = function (a) {
        // websocket readyState (0,1,2,3), RTCDataChannel (connecting,open,closing,closed)
        if (ch.socket.readyState == 0 || ch.socket.readyState == 'connecting') { // socket connecting, try again
            setTimeout(ch.__send, 0, a);
            return true;
        } else {
            if (ch.socket.readyState == 1 || ch.socket.readyState == 'open') { // socket open
                ch.socket.send(JSON.stringify(a)); 
                return true;
            } else return false;
        }
    }

    this.receive = function (key, callback) {
        if (callback == undefined && typeof key == 'function')
            ch.receivers['*'] = key;
        else ch.receivers[key] = callback;
    }
    wsConnect(wsConnectCallback);
}

