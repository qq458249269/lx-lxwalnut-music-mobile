package com.luna.music.visualizer;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ProxyModule extends ReactContextBaseJavaModule {
    private ProxyServer server;

    public ProxyModule(ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() { return "LocalProxy"; }

    @ReactMethod
    public void start(Promise promise) {
        try {
            if (server != null) {
                promise.resolve(server.getPort());
                return;
            }
            server = new ProxyServer();
            int port = server.start();
            promise.resolve(port);
        } catch (Exception e) {
            promise.reject("PROXY_START_FAILED", e.getMessage());
        }
    }

    @ReactMethod
    public void stop() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }

    @ReactMethod
    public void getPort(Promise promise) {
        if (server != null) {
            promise.resolve(server.getPort());
        } else {
            promise.resolve(-1);
        }
    }
}
