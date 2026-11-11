package io.jere.run_escape;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The website's build, for an app that keeps to it rather than to GitHub's releases: co-op only
 * takes players on the host's build. The same rules as desktop/siteFiles.ts, and
 * desktop/siteFiles.cases.json holds the cases both must agree on (SiteFilesTest runs them). Each
 * build writes game-files.json beside index.html (vite.config.ts): every file but the slim cache's,
 * with its sha256, and the addresses it was built with. The cache's chunks are named after their
 * sha256 and listed in caches.json. No Android dependencies, for local tests.
 */
final class SiteFiles {
    static final String NAME = "game-files.json";
    // What a finished install keeps of the game-files.json it was made from (SiteGames)
    static final String MARKER = "verified.json";

    // What __BUILD_ID__ is (vite.config.ts): the version, and the commit or the time it was built
    private static final Pattern BUILD = Pattern.compile("(\\d+\\.\\d+\\.\\d+)-[0-9a-z]{1,16}");
    private static final Pattern VERSION = Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    static final Pattern CHUNK = Pattern.compile("[0-9a-f]{32}\\.bin");
    // JavaScript's Number.MAX_SAFE_INTEGER, as the website's sizes are numbers
    private static final long MAX_SIZE = (1L << 53) - 1;
    private static final String[] ADDRESS_KEYS = {"coopUrl", "runAnalyticsUrl", "cloudSaveUrl"};

    static final class Entry {
        final String path;
        final String sha256;
        final long size;

        Entry(String path, String sha256, long size) {
            this.path = path;
            this.sha256 = sha256;
            this.size = size;
        }
    }

    static final class Chunk {
        final String file;
        final long size;

        Chunk(String file, long size) {
            this.file = file;
            this.size = size;
        }

        /** Its path in a game folder */
        String path() { return "caches/chunks/" + file; }
    }

    final String build;
    final String version;
    // The oldest Android app that can play it, by the app's version (MIN_ANDROID_APP in
    // desktop/version.ts)
    final String minAndroid;
    // The relay, run collector and cloud saves the build reaches (its VITE_ variables), "" for none
    final String coopUrl;
    final String runAnalyticsUrl;
    final String cloudSaveUrl;
    final List<Entry> files;

    private SiteFiles(String build, String version, String minAndroid, String[] addresses,
                      List<Entry> files) {
        this.build = build;
        this.version = version;
        this.minAndroid = minAndroid;
        this.coopUrl = addresses[0];
        this.runAnalyticsUrl = addresses[1];
        this.cloudSaveUrl = addresses[2];
        this.files = Collections.unmodifiableList(files);
    }

    static boolean isBuildId(Object build) {
        return build instanceof String && BUILD.matcher((String) build).matches();
    }

    static boolean isVersion(Object version) {
        return version instanceof String && VERSION.matcher((String) version).matches();
    }

    static boolean isSha256(Object sha256) {
        return sha256 instanceof String && SHA256.matcher((String) sha256).matches();
    }

    /** The version a build id starts with */
    static String versionOf(String build) {
        Matcher matcher = BUILD.matcher(build);
        if (!matcher.matches()) throw new IllegalArgumentException("Not a build id: " + build);
        return matcher.group(1);
    }

    /** Negative, zero or positive as a is older than, the same as or newer than b */
    static int compareVersions(String a, String b) {
        Matcher left = VERSION.matcher(a);
        Matcher right = VERSION.matcher(b);
        if (!left.matches() || !right.matches()) throw new IllegalArgumentException("Not a version");
        for (int i = 1; i <= 3; i++) {
            int order = new BigInteger(left.group(i)).compareTo(new BigInteger(right.group(i)));
            if (order != 0) return order;
        }
        return 0;
    }

    /**
     * A listed file's path is somewhere inside the game's folder, and isn't one the app writes
     * itself: the cache (from caches.json) and the marker of a finished install. The same segments
     * as desktop/gameFiles.ts's zipEntryPath allows, so no "..", "." or empty segment gets through.
     */
    static boolean isSitePath(Object value) {
        if (!(value instanceof String)) return false;
        String file = (String) value;
        if (file.isEmpty() || file.contains("\\") || file.contains("\0") || file.contains(":")
                || file.startsWith("caches/") || file.equals(MARKER) || file.equals(NAME)) {
            return false;
        }
        for (String segment : file.split("/", -1)) {
            if (segment.isEmpty() || segment.endsWith(".") || segment.endsWith(" ")) return false;
        }
        return true;
    }

    /**
     * A whole number of bytes, or -1. Any number JavaScript reads as a safe whole one, as
     * desktop/siteFiles.ts takes, so 10.0 and 1e3 too: org.json gives those as a BigDecimal or a
     * Double, and Android's own org.json as an Integer, Long or Double.
     */
    private static long size(Object value) {
        if (!(value instanceof Number)) return -1;
        try {
            BigDecimal size = new BigDecimal(value.toString());
            boolean whole = size.signum() == 0 || size.stripTrailingZeros().scale() <= 0;
            return whole && size.signum() >= 0 && size.compareTo(BigDecimal.valueOf(MAX_SIZE)) <= 0
                    ? size.longValueExact() : -1;
        } catch (NumberFormatException | ArithmeticException exception) {
            // NaN or infinite
            return -1;
        }
    }

    private static Object parseJson(String text) throws JSONException {
        Object value = new JSONTokener(text).nextValue();
        if (value == null || value == JSONObject.NULL) throw new JSONException("null");
        return value;
    }

    static SiteFiles parse(String text) throws JSONException {
        Object value = parseJson(text);
        if (!(value instanceof JSONObject)) throw new JSONException(NAME + " isn't an object");
        JSONObject data = (JSONObject) value;
        Object build = data.opt("build");
        Object version = data.opt("version");
        Object minAndroid = data.opt("minAndroid");
        // minLauncher is the Windows launcher's, but a list without it isn't one a build writes
        if (!isBuildId(build) || !versionOf((String) build).equals(version)
                || !isVersion(data.opt("minLauncher")) || !isVersion(minAndroid)) {
            throw new JSONException(NAME + "'s build or versions aren't valid");
        }
        String[] addresses = new String[ADDRESS_KEYS.length];
        for (int i = 0; i < ADDRESS_KEYS.length; i++) {
            Object address = data.opt(ADDRESS_KEYS[i]);
            if (!(address instanceof String)) throw new JSONException(NAME + "'s addresses aren't valid");
            addresses[i] = (String) address;
        }
        Object list = data.opt("files");
        if (!(list instanceof JSONArray)) throw new JSONException(NAME + "'s files aren't valid");
        JSONArray array = (JSONArray) list;
        Set<String> seen = new HashSet<>();
        List<Entry> files = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            Object item = array.opt(i);
            JSONObject file = item instanceof JSONObject ? (JSONObject) item : null;
            Object path = file == null ? null : file.opt("path");
            Object sha256 = file == null ? null : file.opt("sha256");
            long size = file == null ? -1 : size(file.opt("size"));
            // Case-blind, so no two files can be one file on a case-insensitive filesystem
            if (!isSitePath(path) || !seen.add(((String) path).toLowerCase(Locale.ROOT))
                    || !isSha256(sha256) || size < 0) {
                throw new JSONException(NAME + "'s files aren't valid");
            }
            files.add(new Entry((String) path, (String) sha256, size));
        }
        if (!seen.contains("index.html")) throw new JSONException(NAME + " has no index.html");
        return new SiteFiles((String) build, (String) version, (String) minAndroid, addresses, files);
    }

    /** The slim cache's chunks, from the website's caches.json, which has to be for the same build */
    static List<Chunk> parseCaches(String text, String build) throws JSONException {
        Object value = parseJson(text);
        JSONArray caches = value instanceof JSONArray ? (JSONArray) value : null;
        Object only = caches != null && caches.length() == 1 ? caches.opt(0) : null;
        JSONObject cache = only instanceof JSONObject ? (JSONObject) only : null;
        Object slimOf = cache == null ? null : cache.opt("slimOf");
        Object chunks = cache == null ? null : cache.opt("chunks");
        // slimOf names the full cache it was made from (scripts/cache/slim-cache.ts)
        boolean slim = slimOf instanceof String && !((String) slimOf).isEmpty();
        if (!slim || !(chunks instanceof JSONArray)) {
            throw new JSONException("The website's caches.json isn't a slim cache");
        }
        if (!build.equals(cache.opt("build"))) {
            throw new JSONException("The website's cache is for " + cache.opt("build") + ", not " + build);
        }
        JSONArray array = (JSONArray) chunks;
        Set<String> seen = new HashSet<>();
        List<Chunk> list = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            Object item = array.opt(i);
            JSONObject chunk = item instanceof JSONObject ? (JSONObject) item : null;
            Object file = chunk == null ? null : chunk.opt("file");
            if (!(file instanceof String) || !CHUNK.matcher((String) file).matches() || !seen.add((String) file)) {
                throw new JSONException("The website's caches.json lists a chunk called " + file);
            }
            long size = size(chunk.opt("size"));
            if (size < 0) throw new JSONException("The website's caches.json has no size for " + file);
            list.add(new Chunk((String) file, size));
        }
        return Collections.unmodifiableList(list);
    }

    /**
     * Why this app shouldn't play the website's build, or null if it can. A build that needs a newer
     * app than this says so with minAndroid. The app only lets out the addresses it was built with
     * (RelayPolicy), so a build reaching others would lose co-op or saves. Unlike the Windows app,
     * it never goes below the APK's own version: a newer APK the player installed isn't undone by a
     * website that hasn't caught up, and its save stays writable. minLauncher is the Windows
     * launcher's, so it's not this app's business.
     */
    String whyNotFollow(String apkVersion, String coop, String runAnalytics, String cloudSave) {
        if (compareVersions(minAndroid, apkVersion) > 0) {
            return build + " needs the Android app's " + minAndroid + " or newer, not " + apkVersion;
        }
        if (compareVersions(version, apkVersion) < 0) {
            return build + " is older than this app's " + apkVersion;
        }
        String[] mine = {coop, runAnalytics, cloudSave};
        String[] theirs = {coopUrl, runAnalyticsUrl, cloudSaveUrl};
        for (int i = 0; i < mine.length; i++) {
            if (!theirs[i].equals(mine[i] == null ? "" : mine[i])) {
                return build + " was built with " + ADDRESS_KEYS[i] + " \"" + theirs[i] + "\", not \""
                        + mine[i] + "\"";
            }
        }
        return null;
    }

    /**
     * The website's address, from the app's build: https, with nothing but a path, and ending in a
     * slash so the game's files resolve inside it. Null when it's not set or not valid.
     */
    static String baseUrl(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        try {
            URI url = new URI(raw.trim());
            if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getRawUserInfo() != null
                    || url.getRawQuery() != null || url.getRawFragment() != null
                    || (url.getPort() != -1 && (url.getPort() < 1 || url.getPort() > 65535))) {
                return null;
            }
            String path = url.getRawPath() == null || url.getRawPath().isEmpty() ? "/" : url.getRawPath();
            if (!path.endsWith("/")) path += "/";
            return url.getScheme() + "://" + url.getRawAuthority() + path;
        } catch (Exception exception) {
            return null;
        }
    }

    /** Where a listed file is on the website. Each segment's encoded, so a name can't become a query. */
    static String fileUrl(String base, String file) {
        StringBuilder url = new StringBuilder(base);
        String[] segments = file.split("/", -1);
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) url.append('/');
            url.append(encodeSegment(segments[i]));
        }
        return url.toString();
    }

    // What JavaScript's encodeURIComponent leaves alone stays, the rest is %XX of its UTF-8 bytes
    private static String encodeSegment(String segment) {
        StringBuilder out = new StringBuilder();
        for (byte b : segment.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xff);
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || "-_.!~*'()".indexOf(c) >= 0) {
                out.append(c);
            } else {
                out.append('%').append(String.format(Locale.ROOT, "%02X", b & 0xff));
            }
        }
        return out.toString();
    }
}
