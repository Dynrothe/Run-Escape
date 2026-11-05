package io.jere.run_escape;

import java.net.URI;
import java.util.Locale;

/**
 * The only remote addresses the bundled game may reach, matching the desktop app: the relay, and
 * the run collector by POST (and its preflight) to its one URL.
 */
public final class RelayPolicy {
    private static final String COLLECTOR_PATH = "/v1/runs";

    private final String host;
    private final int port;
    private final String httpsOrigin;
    private final String websocketOrigin;
    private final String collectorHost;
    private final int collectorPort;
    private final String collectorUrl;

    public RelayPolicy(String coopUrl) {
        this(coopUrl, "");
    }

    public RelayPolicy(String coopUrl, String runAnalyticsUrl) {
        URI relay = parse(coopUrl);
        boolean valid = relay != null && "wss".equals(relay.getScheme())
                && relay.getHost() != null && relay.getRawUserInfo() == null
                && relay.getRawQuery() == null && relay.getRawFragment() == null
                && validPort(relay.getPort());
        host = valid ? relay.getHost().toLowerCase(Locale.ROOT) : null;
        port = valid ? effectivePort(relay) : -1;
        String authority = host == null ? null : authority(host, port);
        httpsOrigin = authority == null ? null : "https://" + authority;
        websocketOrigin = authority == null ? null : "wss://" + authority;

        // The same rules as src/util/runAnalyticsUrl.ts, less its plain http for local testing
        URI collector = parse(runAnalyticsUrl);
        boolean collectorValid = collector != null && isCollector(collector);
        collectorHost = collectorValid ? collector.getHost().toLowerCase(Locale.ROOT) : null;
        collectorPort = collectorValid ? effectivePort(collector) : -1;
        collectorUrl = collectorHost == null
                ? null : "https://" + authority(collectorHost, collectorPort) + COLLECTOR_PATH;
    }

    public boolean allowsNetworkRequest(String method, String url) {
        URI request = parse(url);
        if (request == null || !"https".equals(request.getScheme()) || request.getHost() == null
                || request.getRawUserInfo() != null || request.getRawFragment() != null
                || !validPort(request.getPort())) {
            return false;
        }
        String requestHost = request.getHost().toLowerCase(Locale.ROOT);
        if ("GET".equals(method)) {
            return host != null && host.equals(requestHost) && port == effectivePort(request);
        }
        return ("POST".equals(method) || "OPTIONS".equals(method)) && collectorHost != null
                && isCollector(request) && collectorHost.equals(requestHost)
                && collectorPort == effectivePort(request);
    }

    // WebSockets bypass WebViewClient, so documents and workers also need this policy.
    public String contentSecurityPolicy() {
        return "connect-src 'self'"
                + (httpsOrigin == null ? "" : " " + httpsOrigin + " " + websocketOrigin)
                + (collectorUrl == null ? "" : " " + collectorUrl);
    }

    private static boolean isCollector(URI uri) {
        return "https".equals(uri.getScheme()) && uri.getHost() != null
                && uri.getRawUserInfo() == null && uri.getRawQuery() == null
                && uri.getRawFragment() == null && validPort(uri.getPort())
                && COLLECTOR_PATH.equals(uri.getRawPath());
    }

    private static String authority(String host, int port) {
        return host + (port == 443 ? "" : ":" + port);
    }

    private static URI parse(String url) {
        if (url == null || url.trim().isEmpty()) return null;
        try {
            return new URI(url.trim());
        } catch (Exception exception) {
            return null;
        }
    }

    private static boolean validPort(int port) {
        return port == -1 || (port > 0 && port <= 65535);
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() == -1 ? 443 : uri.getPort();
    }
}
