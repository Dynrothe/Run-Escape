package io.jere.run_escape;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.WebResourceResponse;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves the game over a real loopback HTTP origin instead of WebView's virtual
 * appassets.androidplatform.net scheme. The point is that GeckoView (any real browser engine,
 * really) honours genuine Cross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy response
 * headers for SharedArrayBuffer, the same way desktop/gameServer.ts's real HTTP responses do for
 * the Electron app - no WebView-only CROSS_ORIGIN_ISOLATED_ALLOWLIST escape hatch needed, and
 * none exists in GeckoView.
 *
 * <p>The origin (host:port) is where the game's localStorage/IndexedDB/save data lives, so it
 * must stay the same across launches: the chosen port is persisted in SharedPreferences and
 * reused every time. A rare port conflict with another app on the device fails loudly (the
 * caller shows a retry screen) rather than silently picking a new port and stranding saves
 * under the old one.
 */
final class LoopbackServer extends Thread {
    private static final String TAG = "LoopbackServer";
    private static final String PREFS = "loopback-server";
    private static final String KEY_PORT = "port";
    // A high, uncommon port as the first try; real conflicts are rare but must be visible, not
    // silently worked around by changing origin (see class doc).
    private static final int PREFERRED_PORT = 47893;
    private static final String GAME = "game/";
    private static final String CHECK_PATH = "game/offline-check.html";
    private static final String WORKER_PATH = "game/offline-check-worker.js";
    private static final String EXPORT_PATH = "/__native/export";
    private static final int MAX_EXPORT_BYTES = 2 * 1024 * 1024;

    /** Mirrors saveFile.ts's AppDownloads message: the game hands over {name, text}. */
    interface ExportHandler {
        /** Must block the calling (request) thread until the export is written or has failed. */
        boolean export(String name, String text);
    }

    private final GamePathHandler games;
    private final RelayPolicy relayPolicy;
    private final ExportHandler exportHandler;
    private final ServerSocket socket;
    private volatile boolean running = true;

    LoopbackServer(Context context, GamePathHandler games, RelayPolicy relayPolicy,
                    ExportHandler exportHandler) throws IOException {
        this.games = games;
        this.relayPolicy = relayPolicy;
        this.exportHandler = exportHandler;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int preferred = prefs.getInt(KEY_PORT, PREFERRED_PORT);
        this.socket = bind(preferred);
        prefs.edit().putInt(KEY_PORT, this.socket.getLocalPort()).apply();
    }

    // Tries the saved/preferred port first (keeps the origin, and the saves under it, stable),
    // then a small deterministic fallback range before giving up loudly.
    private static ServerSocket bind(int preferred) throws IOException {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        IOException last = null;
        for (int port : new int[] {preferred, PREFERRED_PORT, PREFERRED_PORT + 1, PREFERRED_PORT + 2}) {
            try {
                return new ServerSocket(port, 50, loopback);
            } catch (IOException exception) {
                last = exception;
            }
        }
        throw new IOException("No loopback port available for the game server", last);
    }

    int getPort() {
        return socket.getLocalPort();
    }

    String origin() {
        return "http://127.0.0.1:" + getPort();
    }

    void shutdown() {
        running = false;
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }

    @Override
    public void run() {
        while (running) {
            try {
                Socket client = socket.accept();
                // One thread per request: an export waiting on the document picker must never
                // block the game's own asset loads.
                new Thread(() -> handle(client)).start();
            } catch (IOException e) {
                if (running) Log.w(TAG, "accept failed", e);
            }
        }
    }

    private void handle(Socket client) {
        try (Socket c = client) {
            InputStream rawIn = c.getInputStream();
            byte[] headerBytes = readHeaderBlock(rawIn);
            if (headerBytes == null) return;
            String headerText = new String(headerBytes, StandardCharsets.US_ASCII);
            String[] lines = headerText.split("\r\n");
            if (lines.length == 0) return;
            String[] parts = lines[0].split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            String path = parts[1];

            int contentLength = 0;
            for (int i = 1; i < lines.length; i++) {
                String line = lines[i];
                if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) {
                    try {
                        contentLength = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                    } catch (NumberFormatException ignored) {
                    }
                }
            }

            OutputStream out = c.getOutputStream();
            if ("POST".equals(method) && EXPORT_PATH.equals(path)) {
                byte[] body = readExactly(rawIn, contentLength);
                handleExport(body, out);
                return;
            }
            if (!"GET".equals(method)) {
                writeResponse(out, 405, "text/plain", null, "Method not allowed".getBytes(StandardCharsets.UTF_8));
                return;
            }
            handleGet(path, out);
        } catch (IOException e) {
            Log.w(TAG, "request handling failed", e);
        }
    }

    // Reads raw bytes up to and including the blank line that ends the request's headers,
    // without decoding or over-buffering past it (the body, if any, must be read as bytes next -
    // UTF-8 save text would get mangled by a char-based reader on an arbitrary byte boundary).
    private static byte[] readHeaderBlock(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int state = 0; // counts progress through \r\n\r\n
        int b;
        while ((b = in.read()) != -1) {
            buf.write(b);
            switch (state) {
                case 0: state = b == '\r' ? 1 : 0; break;
                case 1: state = b == '\n' ? 2 : (b == '\r' ? 1 : 0); break;
                case 2: state = b == '\r' ? 3 : 0; break;
                case 3:
                    if (b == '\n') return buf.toByteArray();
                    state = b == '\r' ? 1 : 0;
                    break;
                default: state = 0;
            }
        }
        return buf.size() > 0 ? buf.toByteArray() : null;
    }

    private static byte[] readExactly(InputStream in, int length) throws IOException {
        if (length <= 0) return new byte[0];
        byte[] buf = new byte[length];
        int read = 0;
        while (read < length) {
            int n = in.read(buf, read, length - read);
            if (n == -1) break;
            read += n;
        }
        return read == length ? buf : java.util.Arrays.copyOf(buf, read);
    }

    private void handleGet(String path, OutputStream out) throws IOException {
        String withoutQuery = path.contains("?") ? path.substring(0, path.indexOf('?')) : path;
        String assetPath = withoutQuery.startsWith("/") ? withoutQuery.substring(1) : withoutQuery;
        if (assetPath.isEmpty() || assetPath.equals("game") || assetPath.equals(GAME)) {
            assetPath = "game/index.html";
        }

        if (CHECK_PATH.equals(assetPath)) {
            byte[] body = diagnosticHtml().getBytes(StandardCharsets.UTF_8);
            writeResponse(out, 200, "text/html; charset=utf-8", isolationHeaders(), body);
            return;
        }
        if (WORKER_PATH.equals(assetPath)) {
            byte[] body = diagnosticWorkerJs().getBytes(StandardCharsets.UTF_8);
            writeResponse(out, 200, "text/javascript; charset=utf-8", isolationHeaders(), body);
            return;
        }

        WebResourceResponse response = assetPath.startsWith(GAME)
                ? games.handle(assetPath.substring(GAME.length()))
                : null;
        if (response == null) {
            writeResponse(out, 404, "text/plain", null, "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }

        byte[] body = readAll(response.getData());
        if (assetPath.equals("game/index.html")) body = injectNativeBridge(body);

        String mimeType = response.getMimeType();
        if (mimeType == null) mimeType = guessMimeType(assetPath);
        Map<String, String> headers = new HashMap<>(isolationHeaders());
        if (response.getResponseHeaders() != null) headers.putAll(response.getResponseHeaders());
        writeResponse(out, 200, mimeType, headers, body);
    }

    // The game expects window.NativeDownloads.postMessage(json) / .onmessage (saveFile.ts),
    // exactly the shape androidx.webkit's WebMessageListener used to inject into the WebView
    // page. GeckoView has no equivalent "inject a named JS object" API, so the same contract is
    // recreated here with a plain <script> shim backed by fetch() to our own /__native/export -
    // the unmodified game code never has to know the difference.
    private byte[] injectNativeBridge(byte[] html) {
        String shim = "<script>window.NativeDownloads={onmessage:null,postMessage:function(msg){"
                + "fetch('" + EXPORT_PATH + "',{method:'POST',body:msg}).then(function(r){"
                + "if(r.ok&&window.NativeDownloads.onmessage){window.NativeDownloads.onmessage({data:'saved'});}"
                + "});}};</script>";
        String page = new String(html, StandardCharsets.UTF_8);
        int headEnd = page.indexOf("</head>");
        String withShim = headEnd >= 0
                ? page.substring(0, headEnd) + shim + page.substring(headEnd)
                : shim + page;
        return withShim.getBytes(StandardCharsets.UTF_8);
    }

    private void handleExport(byte[] body, OutputStream out) throws IOException {
        if (body.length == 0 || body.length > MAX_EXPORT_BYTES) {
            writeResponse(out, 413, "text/plain", null, "Too large".getBytes(StandardCharsets.UTF_8));
            return;
        }
        boolean ok;
        try {
            JSONObject file = new JSONObject(new String(body, StandardCharsets.UTF_8));
            ok = exportHandler.export(file.optString("name"), file.getString("text"));
        } catch (Exception exception) {
            ok = false;
        }
        byte[] responseBody = (ok ? "saved" : "failed").getBytes(StandardCharsets.UTF_8);
        writeResponse(out, ok ? 200 : 500, "text/plain", null, responseBody);
    }

    private Map<String, String> isolationHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Document-Isolation-Policy", "isolate-and-credentialless");
        headers.put("Cross-Origin-Opener-Policy", "same-origin");
        headers.put("Cross-Origin-Embedder-Policy", "require-corp");
        headers.put("Cross-Origin-Resource-Policy", "same-origin");
        headers.put("Content-Security-Policy", relayPolicy.contentSecurityPolicy());
        headers.put("Cache-Control", "no-cache");
        return headers;
    }

    private static byte[] readAll(InputStream input) throws IOException {
        if (input == null) return new byte[0];
        try (InputStream in = input; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
            return buf.toByteArray();
        }
    }

    private static String guessMimeType(String path) {
        if (path.endsWith(".wasm")) return "application/wasm";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".ogg")) return "audio/ogg";
        if (path.endsWith(".ttf")) return "font/ttf";
        if (path.endsWith(".bin")) return "application/octet-stream";
        return "application/octet-stream";
    }

    private void writeResponse(OutputStream out, int status, String contentType,
                                Map<String, String> extraHeaders, byte[] body) throws IOException {
        StringBuilder headers = new StringBuilder();
        headers.append("HTTP/1.0 ").append(status).append(' ').append(reason(status)).append("\r\n");
        headers.append("Content-Type: ").append(contentType).append("\r\n");
        headers.append("Content-Length: ").append(body.length).append("\r\n");
        if (extraHeaders != null) {
            for (Map.Entry<String, String> entry : extraHeaders.entrySet()) {
                headers.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
            }
        }
        headers.append("Connection: close\r\n\r\n");
        out.write(headers.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 413: return "Payload Too Large";
            case 500: return "Internal Server Error";
            default: return "Unknown";
        }
    }

    // Same check as before (src/game/cache.ts's offline bootstrap), reporting through
    // document.title instead of a polled global: GeckoSession's ContentDelegate.onTitleChange
    // (proven in the feasibility spike) is the hook MainActivity uses to gate loading the real
    // game, since GeckoView has no public generic evaluateJavascript to poll a JS variable the
    // way WebView's did.
    private static String diagnosticHtml() {
        return "<!doctype html><title>pending</title>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>html,body{background:#000}</style><script>"
                + "let worker;function report(s){document.title=s;}"
                + "try{if(!window.crossOriginIsolated||typeof SharedArrayBuffer!=='function')throw Error('isolation');"
                + "let canvas=document.createElement('canvas');let gl=canvas.getContext('webgl2');"
                + "if(!gl)throw Error('graphics');let lose=gl.getExtension('WEBGL_lose_context');"
                + "if(lose)lose.loseContext();canvas=null;gl=null;"
                + "const buffer=new SharedArrayBuffer(4),view=new Int32Array(buffer);view[0]=42;"
                + "worker=new Worker('offline-check-worker.js');"
                + "worker.onmessage=e=>{report(e.data===43&&view[0]===43?'passed':'failed');worker.terminate()};"
                + "worker.onerror=()=>{report('failed');worker.terminate()};"
                + "worker.postMessage(buffer);"
                + "setTimeout(()=>{if(document.title==='pending'){report('failed');worker.terminate()}},8000);"
                + "}catch(e){report('failed')}"
                + "</script>";
    }

    private static String diagnosticWorkerJs() {
        return "self.onmessage=async e=>{try{"
                + "const r=await fetch('caches/caches.json');if(!r.ok)throw Error('cache');"
                + "const c=await r.json();if(!Array.isArray(c)||!c.length)throw Error('cache');"
                + "const v=new Int32Array(e.data);v[0]+=1;self.postMessage(v[0]);"
                + "}catch(e){self.postMessage(-1)}};";
    }
}
