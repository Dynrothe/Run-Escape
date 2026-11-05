package io.jere.run_escape;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class RelayPolicyTest {
    private static final String COLLECTOR = "https://collector.example/v1/runs";

    @Test
    public void soloNeedsNoRemoteOrigin() {
        RelayPolicy policy = new RelayPolicy("");
        assertEquals("connect-src 'self'", policy.contentSecurityPolicy());
        assertFalse(policy.allowsNetworkRequest("GET", "https://relay.example/coop"));
    }

    @Test
    public void allowsTheRelaysHttpsAvailabilityAndRoomEndpoints() {
        RelayPolicy policy = new RelayPolicy("wss://relay.example/coop");
        assertTrue(policy.allowsNetworkRequest("GET", "https://relay.example/coop"));
        assertTrue(policy.allowsNetworkRequest("GET", "https://relay.example/coop/room/ABC?player=1"));
        assertEquals("connect-src 'self' https://relay.example wss://relay.example", policy.contentSecurityPolicy());
    }

    @Test
    public void onlyGetsFromTheRelay() {
        RelayPolicy policy = new RelayPolicy("wss://relay.example/coop");
        assertFalse(policy.allowsNetworkRequest("POST", "https://relay.example/coop"));
        assertFalse(policy.allowsNetworkRequest("OPTIONS", "https://relay.example/coop"));
    }

    @Test
    public void normalizesDefaultPortsAndHostCase() {
        RelayPolicy policy = new RelayPolicy("wss://Relay.Example:443/coop");
        assertTrue(policy.allowsNetworkRequest("GET", "https://relay.example/coop"));
        assertTrue(policy.allowsNetworkRequest("GET", "https://RELAY.EXAMPLE:443/coop"));
        assertFalse(policy.allowsNetworkRequest("GET", "https://relay.example:444/coop"));
        assertEquals("connect-src 'self' https://relay.example wss://relay.example", policy.contentSecurityPolicy());
    }

    @Test
    public void keepsAnExplicitRelayPort() {
        RelayPolicy policy = new RelayPolicy("wss://relay.example:8443/coop");
        assertTrue(policy.allowsNetworkRequest("GET", "https://relay.example:8443/coop"));
        assertFalse(policy.allowsNetworkRequest("GET", "https://relay.example/coop"));
        assertEquals("connect-src 'self' https://relay.example:8443 wss://relay.example:8443", policy.contentSecurityPolicy());
    }

    @Test
    public void rejectsOtherHostsCredentialsAndInsecureSchemes() {
        RelayPolicy policy = new RelayPolicy("wss://relay.example/coop");
        for (String url : new String[]{
                "https://relay.example.evil.test/coop", "https://evil.test/coop",
                "https://relay.example@evil.test/coop", "https://name@relay.example/coop",
                "http://relay.example/coop", "wss://relay.example/coop",
                "file:///coop", "javascript:alert(1)", "https://relay.example:0/coop",
                "https://relay.example:65536/coop", "https://relay.example/coop#fragment",
                "not a URL", "", null
        }) assertFalse(url, policy.allowsNetworkRequest("GET", url));
    }

    @Test
    public void invalidConfigurationFailsClosed() {
        for (String url : new String[]{
                "ws://relay.example/coop", "https://relay.example/coop", "wss:///coop",
                "wss://name@relay.example/coop", "wss://relay.example/coop?key=1",
                "wss://relay.example/coop#fragment", "wss://relay.example:0/coop",
                "wss://relay.example:65536/coop", "garbage", null
        }) {
            RelayPolicy policy = new RelayPolicy(url);
            assertEquals("connect-src 'self'", policy.contentSecurityPolicy());
            assertFalse(policy.allowsNetworkRequest("GET", "https://relay.example/coop"));
        }
    }

    @Test
    public void supportsIpv6RelayOrigins() {
        RelayPolicy policy = new RelayPolicy("wss://[::1]:8443/coop");
        assertTrue(policy.allowsNetworkRequest("GET", "https://[::1]:8443/coop"));
        assertFalse(policy.allowsNetworkRequest("GET", "https://[::1]:443/coop"));
        assertEquals("connect-src 'self' https://[::1]:8443 wss://[::1]:8443", policy.contentSecurityPolicy());
    }

    @Test
    public void postsRunsOnlyToTheCollectorsOneUrl() {
        RelayPolicy policy = new RelayPolicy("wss://relay.example/coop", COLLECTOR);
        assertTrue(policy.allowsNetworkRequest("POST", COLLECTOR));
        assertTrue(policy.allowsNetworkRequest("OPTIONS", COLLECTOR));
        assertTrue(policy.allowsNetworkRequest("POST", "https://Collector.Example:443/v1/runs"));
        for (String url : new String[]{
                "https://collector.example/v1/runs/", "https://collector.example/v1/other",
                "https://collector.example/v1/runs?x=1", "https://collector.example:444/v1/runs",
                "http://collector.example/v1/runs", "https://relay.example/v1/runs",
                "https://name@collector.example/v1/runs"
        }) assertFalse(url, policy.allowsNetworkRequest("POST", url));
        assertFalse(policy.allowsNetworkRequest("GET", COLLECTOR));
        assertFalse(policy.allowsNetworkRequest("PUT", COLLECTOR));
        assertEquals("connect-src 'self' https://relay.example wss://relay.example " + COLLECTOR,
                policy.contentSecurityPolicy());
    }

    @Test
    public void anInvalidCollectorIsLeftOut() {
        for (String url : new String[]{
                "http://collector.example/v1/runs", "https://collector.example/runs",
                "https://collector.example/v1/runs?key=1", "https://name@collector.example/v1/runs",
                "garbage", "", null
        }) {
            RelayPolicy policy = new RelayPolicy("", url);
            assertEquals("connect-src 'self'", policy.contentSecurityPolicy());
            assertFalse(url, policy.allowsNetworkRequest("POST", "https://collector.example/v1/runs"));
        }
    }
}
