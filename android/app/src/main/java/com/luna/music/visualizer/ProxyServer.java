package com.luna.music.visualizer;

import android.util.Log;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class ProxyServer {
    private static final String TAG = "LocalProxy";
    private ServerSocket serverSocket;
    private int port;
    private volatile boolean running;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private Thread serverThread;
    private OkHttpClient httpClient;

    public int start() throws Exception {
        httpClient = new OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .build();

        serverSocket = new ServerSocket();
        serverSocket.setReuseAddress(true);
        serverSocket.bind(new InetSocketAddress("127.0.0.1", 0));
        port = serverSocket.getLocalPort();
        running = true;

        serverThread = new Thread(() -> {
            while (running) {
                try {
                    Socket client = serverSocket.accept();
                    executor.submit(() -> handleClient(client));
                } catch (Exception e) {
                    if (running) Log.e(TAG, "Accept error", e);
                }
            }
        }, "proxy-server");
        serverThread.setDaemon(true);
        serverThread.start();
        Log.i(TAG, "Proxy started on port " + port);
        return port;
    }

    public void stop() {
        running = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {}
        executor.shutdownNow();
    }

    public int getPort() { return port; }

    private void handleClient(Socket client) {
        try {
            client.setSoTimeout(60_000);
            InputStream in = client.getInputStream();
            OutputStream out = client.getOutputStream();

            StringBuilder request = new StringBuilder();
            byte[] buf = new byte[4096];
            int read;
            while ((read = in.read(buf)) != -1) {
                request.append(new String(buf, 0, read));
                if (request.toString().contains("\r\n\r\n")) break;
            }

            String firstLine = request.toString().split("\r\n")[0];
            String[] parts = firstLine.split(" ");
            String method = parts[0];
            if (parts.length < 2 || (!"GET".equals(method) && !"HEAD".equals(method))) {
                sendError(out, 405, "Method Not Allowed");
                return;
            }

            String path = parts[1];
            if (!path.startsWith("/proxy")) {
                sendError(out, 404, "Not Found");
                return;
            }

            Map<String, String> params = parseQuery(path);
            String targetUrl = params.get("url");
            if (targetUrl == null || targetUrl.isEmpty()) {
                sendError(out, 400, "Missing url parameter");
                return;
            }

            targetUrl = URLDecoder.decode(targetUrl, "UTF-8");
            String referer = params.containsKey("referer") ? URLDecoder.decode(params.get("referer"), "UTF-8") : "";

            Log.i(TAG, method + " " + targetUrl.substring(0, Math.min(120, targetUrl.length())));

            Request.Builder rb = new Request.Builder()
                .url(targetUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
                .header("Accept", "*/*")
                .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
                .header("Accept-Encoding", "identity")
                .header("Connection", "keep-alive");
            if (!referer.isEmpty()) {
                rb.header("Referer", referer);
            }

            Response response = httpClient.newCall(rb.build()).execute();
            int code = response.code();
            okhttp3.ResponseBody body = response.body();
            String contentType = response.header("Content-Type");
            long contentLength = body != null ? body.contentLength() : -1;
            String contentRange = response.header("Content-Range");

            Log.i(TAG, "Response: " + code + " type=" + contentType + " len=" + contentLength);

            StringBuilder rh = new StringBuilder();
            rh.append("HTTP/1.1 ").append(code).append(" OK\r\n");
            rh.append("Access-Control-Allow-Origin: *\r\n");
            rh.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n");
            rh.append("Access-Control-Allow-Headers: *\r\n");
            rh.append("Access-Control-Expose-Headers: *\r\n");
            if (contentType != null) rh.append("Content-Type: ").append(contentType).append("\r\n");
            if (contentLength > 0) rh.append("Content-Length: ").append(contentLength).append("\r\n");
            if (contentRange != null) rh.append("Content-Range: ").append(contentRange).append("\r\n");
            rh.append("Accept-Ranges: bytes\r\n");
            rh.append("Connection: close\r\n");
            rh.append("\r\n");

            out.write(rh.toString().getBytes("UTF-8"));
            out.flush();

            if ("HEAD".equals(method)) { response.close(); return; }

            if (body != null) {
                InputStream src = body.byteStream();
                buf = new byte[16384];
                while ((read = src.read(buf)) != -1) {
                    out.write(buf, 0, read);
                    out.flush();
                }
                src.close();
            }
            response.close();
        } catch (Exception e) {
            Log.e(TAG, "Proxy error: " + e.getMessage(), e);
            try { sendError(client.getOutputStream(), 502, "Proxy Error: " + e.getMessage()); } catch (Exception ignored) {}
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    private void sendError(OutputStream out, int code, String message) throws Exception {
        String body = "{\"error\":\"" + message + "\"}";
        String resp = "HTTP/1.1 " + code + " Error\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + body.getBytes("UTF-8").length + "\r\n\r\n" + body;
        out.write(resp.getBytes("UTF-8"));
        out.flush();
    }

    private Map<String, String> parseQuery(String path) {
        Map<String, String> params = new HashMap<>();
        int idx = path.indexOf('?');
        if (idx < 0) return params;
        String query = path.substring(idx + 1);
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0) params.put(pair.substring(0, eq), pair.substring(eq + 1));
        }
        return params;
    }
}
