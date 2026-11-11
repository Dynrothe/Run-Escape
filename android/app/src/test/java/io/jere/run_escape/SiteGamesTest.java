package io.jere.run_escape;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public final class SiteGamesTest {
    private static final String BASE = "https://jere.io/run-escape/";
    private static final String COOP = "wss://relay.example/coop";
    private static final SiteGames.Addresses ADDRESSES = new SiteGames.Addresses(COOP, "", "");
    private static final String APK_BUILD = "0.30.0-aaaaaaaa";
    private static final String SITE_BUILD = "0.30.0-bbbbbbbb";

    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    private File sites;

    @Before
    public void setUp() throws IOException {
        sites = temporary.newFolder("site");
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static String sha256(byte[] data) {
        java.security.MessageDigest digest = SiteGames.sha256();
        return SiteGames.hex(digest.digest(data));
    }

    private static String chunkName(byte[] data) {
        return sha256(data).substring(0, 32) + ".bin";
    }

    /** A build's files, its game-files.json and caches.json, and the website or game holding them */
    private static final class Build {
        final String build;
        final Map<String, byte[]> files = new LinkedHashMap<>();
        final Map<String, byte[]> chunks = new LinkedHashMap<>();
        String coopUrl = COOP;

        Build(String build) {
            this.build = build;
        }

        Build file(String path, String text) {
            files.put(path, bytes(text));
            return this;
        }

        Build chunk(String text) {
            byte[] data = bytes(text);
            chunks.put(chunkName(data), data);
            return this;
        }

        String filesJson() throws JSONException {
            JSONArray list = new JSONArray();
            for (Map.Entry<String, byte[]> file : files.entrySet()) {
                list.put(new JSONObject().put("path", file.getKey()).put("sha256", sha256(file.getValue()))
                        .put("size", file.getValue().length));
            }
            return new JSONObject().put("build", build).put("version", SiteFiles.versionOf(build))
                    .put("minLauncher", "9.9.9").put("coopUrl", coopUrl).put("runAnalyticsUrl", "")
                    .put("cloudSaveUrl", "").put("files", list).toString();
        }

        String cachesJson() throws JSONException {
            JSONArray list = new JSONArray();
            for (Map.Entry<String, byte[]> chunk : chunks.entrySet()) {
                list.put(new JSONObject().put("file", chunk.getKey()).put("size", chunk.getValue().length));
            }
            return new JSONArray().put(new JSONObject().put("slimOf", "osrs").put("build", build)
                    .put("chunks", list)).toString();
        }

        /** Everything at its path in a game folder, as the APK or a website has it */
        Map<String, byte[]> everything() throws JSONException {
            Map<String, byte[]> all = new HashMap<>(files);
            for (Map.Entry<String, byte[]> chunk : chunks.entrySet()) {
                all.put("caches/chunks/" + chunk.getKey(), chunk.getValue());
            }
            all.put("caches/caches.json", bytes(cachesJson()));
            all.put("build.json", bytes(new JSONObject().put("build", build).toString()));
            all.put(SiteFiles.NAME, bytes(filesJson()));
            return all;
        }

        SiteGames.Game game() throws JSONException {
            Map<String, byte[]> all = everything();
            SiteGames.Source source = path -> all.containsKey(path) ? new ByteArrayInputStream(all.get(path)) : null;
            return new SiteGames.Game(source, SiteFiles.parse(filesJson()));
        }

        SiteGames.SiteBuild site() throws JSONException {
            return new SiteGames.SiteBuild(filesJson(), cachesJson());
        }
    }

    /** The website: what each address answers, and which were asked for */
    private static final class Website implements SiteGames.Fetcher {
        final Map<String, byte[]> answers = new HashMap<>();
        final List<String> asked = Collections.synchronizedList(new ArrayList<>());

        Website(Build build) throws JSONException {
            for (Map.Entry<String, byte[]> file : build.everything().entrySet()) {
                answers.put(SiteFiles.fileUrl(BASE, file.getKey()), file.getValue());
            }
        }

        @Override
        public InputStream open(String url) throws IOException {
            asked.add(url.substring(BASE.length()));
            byte[] answer = answers.get(url);
            if (answer == null) throw new FileNotFoundException(url + " answered 404");
            return new ByteArrayInputStream(answer);
        }

        List<String> downloads() {
            List<String> files = new ArrayList<>(asked);
            files.remove(SiteFiles.NAME);
            files.remove("caches/caches.json");
            Collections.sort(files);
            return files;
        }
    }

    private static Build apk() {
        return new Build(APK_BUILD).file("index.html", "<html>old").file("assets/shared.js", "shared")
                .file("assets/old.js", "old").chunk("chunk one").chunk("chunk two");
    }

    // The website's build: a new index.html and script, the shared script renamed, one new chunk
    private static Build website() {
        return new Build(SITE_BUILD).file("index.html", "<html>new").file("assets/renamed.js", "shared")
                .file("assets/new.js", "new").chunk("chunk one").chunk("chunk three");
    }

    private static String read(File file) throws IOException {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private String update(Build apk, Website site, File inUse) throws JSONException {
        return SiteGames.update(BASE, site, sites, apk.game(), apk.build, "0.30.0", inUse, ADDRESSES, () -> false);
    }

    private List<String> sitesList() {
        String[] names = sites.list();
        List<String> list = new ArrayList<>(Arrays.asList(names == null ? new String[0] : names));
        Collections.sort(list);
        return list;
    }

    @Test
    public void downloadsOnlyWhatTheApksGameDoesntHave() throws Exception {
        Build website = website();
        Website site = new Website(website);
        String result = update(apk(), site, null);

        assertTrue(result, result.contains("Downloaded"));
        // The shared script's copied though it's called something else, and the chunk it has by name
        assertEquals(Arrays.asList("assets/new.js", "caches/chunks/" + chunkName(bytes("chunk three")),
                "index.html"), site.downloads());
        File folder = new File(sites, SITE_BUILD);
        assertEquals("<html>new", read(new File(folder, "index.html")));
        assertEquals("shared", read(new File(folder, "assets/renamed.js")));
        assertEquals("chunk one", read(new File(folder, "caches/chunks/" + chunkName(bytes("chunk one")))));
        assertEquals(website.cachesJson(), read(new File(folder, "caches/caches.json")));
        assertFalse(new File(folder, "assets/old.js").exists());
        assertEquals(Arrays.asList(SITE_BUILD, SiteGames.CURRENT), sitesList());
        // Played from the next launch
        assertEquals(folder, SiteGames.pick(sites, "0.30.0"));
    }

    @Test
    public void downloadsEverythingWhenTheGameHasNoList() throws Exception {
        Build apk = apk();
        Map<String, byte[]> all = apk.everything();
        SiteGames.Game unlisted = new SiteGames.Game(path -> all.containsKey(path)
                ? new ByteArrayInputStream(all.get(path)) : null, null);
        Website site = new Website(website());
        SiteGames.install(website().site(), BASE, sites, Collections.singletonList(unlisted), site, () -> false, 2);
        // Chunks are still found by name
        assertEquals(Arrays.asList("assets/new.js", "assets/renamed.js",
                "caches/chunks/" + chunkName(bytes("chunk three")), "index.html"), site.downloads());
    }

    @Test
    public void aCopyThatIsntTheFileListedIsDownloadedInstead() throws Exception {
        Build apk = apk();
        Map<String, byte[]> all = apk.everything();
        // The APK's list says shared.js is the website's, but its bytes aren't
        all.put("assets/shared.js", bytes("tampered"));
        SiteGames.Game game = new SiteGames.Game(path -> all.containsKey(path)
                ? new ByteArrayInputStream(all.get(path)) : null, SiteFiles.parse(apk.filesJson()));
        Website site = new Website(website());
        File folder = SiteGames.install(website().site(), BASE, sites, Collections.singletonList(game), site,
                () -> false, 2);
        assertTrue(site.downloads().contains("assets/renamed.js"));
        assertEquals("shared", read(new File(folder, "assets/renamed.js")));
    }

    private void assertInstallFails(Website site) throws Exception {
        try {
            SiteGames.install(website().site(), BASE, sites, Collections.singletonList(apk().game()), site,
                    () -> false, 2);
            fail("Installed");
        } catch (IOException expected) {
            // Nothing's left of it
        }
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void aDownloadThatIsntTheFileListedStopsTheInstall() throws Exception {
        Website site = new Website(website());
        site.answers.put(BASE + "assets/new.js", bytes("wen"));
        assertInstallFails(site);
    }

    @Test
    public void aDownloadLongerOrShorterThanListedStopsTheInstall() throws Exception {
        Website longer = new Website(website());
        longer.answers.put(BASE + "assets/new.js", bytes("newer"));
        assertInstallFails(longer);
        Website shorter = new Website(website());
        shorter.answers.put(BASE + "assets/new.js", bytes("ne"));
        assertInstallFails(shorter);
    }

    @Test
    public void aChunkThatIsntItsNameStopsTheInstall() throws Exception {
        Website site = new Website(website());
        String name = chunkName(bytes("chunk three"));
        site.answers.put(BASE + "caches/chunks/" + name, bytes("chunk thref"));
        assertInstallFails(site);
    }

    @Test
    public void aMissingFileStopsTheInstall() throws Exception {
        Website site = new Website(website());
        site.answers.remove(BASE + "assets/new.js");
        assertInstallFails(site);
    }

    @Test
    public void aBuildTooBigForThePhoneIsntStarted() throws Exception {
        Build huge = website();
        JSONObject files = new JSONObject(huge.filesJson());
        files.getJSONArray("files").getJSONObject(0).put("size", SiteGames.MAX_BUILD_BYTES + 1);
        Website site = new Website(huge);
        try {
            SiteGames.install(new SiteGames.SiteBuild(files.toString(), huge.cachesJson()), BASE, sites,
                    Collections.singletonList(apk().game()), site, () -> false, 2);
            fail("Installed");
        } catch (IOException expected) {
            // Refused before anything's asked for
        }
        assertEquals(Collections.emptyList(), site.asked);
    }

    @Test
    public void closingTheAppLeavesNothingBehind() throws Exception {
        Website site = new Website(website());
        AtomicBoolean closed = new AtomicBoolean();
        SiteGames.Fetcher closing = url -> {
            closed.set(true);
            return site.open(url);
        };
        try {
            SiteGames.install(website().site(), BASE, sites, Collections.singletonList(apk().game()), closing,
                    closed::get, 1);
            fail("Installed");
        } catch (SiteGames.CancelledException expected) {
            // Stopped
        }
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void offlineNothingChanges() throws Exception {
        File inUse = installed(website());
        SiteGames.Fetcher offline = url -> {
            throw new IOException("No network");
        };
        String result = SiteGames.update(BASE, offline, sites, apk().game(), APK_BUILD, "0.30.0", inUse,
                ADDRESSES, () -> false);
        assertTrue(result, result.contains("skipped"));
        assertEquals(inUse, SiteGames.pick(sites, "0.30.0"));
    }

    @Test
    public void wontFollowAWebsiteWithOtherAddresses() throws Exception {
        Build website = website();
        website.coopUrl = "wss://other.example/coop";
        Website site = new Website(website);
        String result = update(apk(), site, null);
        assertTrue(result, result.contains("coopUrl"));
        assertEquals(Collections.emptyList(), site.downloads());
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void wontFollowAWebsiteOlderThanTheApk() throws Exception {
        Website site = new Website(website());
        String result = SiteGames.update(BASE, site, sites, apk().game(), APK_BUILD, "0.30.1", null, ADDRESSES,
                () -> false);
        assertTrue(result, result.contains("older"));
        assertEquals(Collections.emptyList(), site.downloads());
    }

    @Test
    public void wontFollowACacheMadeForAnotherBuild() throws Exception {
        Website site = new Website(website());
        site.answers.put(BASE + "caches/caches.json", bytes(apk().cachesJson()));
        String result = update(apk(), site, null);
        assertTrue(result, result.contains("skipped"));
        assertEquals(Collections.emptyList(), site.downloads());
    }

    @Test
    public void goesBackToTheApksGameWhenTheWebsiteIsOnIt() throws Exception {
        File inUse = installed(website());
        Website site = new Website(apk());
        String result = update(apk(), site, inUse);
        assertTrue(result, result.contains("own game"));
        assertEquals(Collections.emptyList(), site.downloads());
        // The APK's game from the next launch, which clears the old folder
        assertNull(SiteGames.pick(sites, "0.30.0"));
        SiteGames.removeOthers(sites, null);
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void downloadsNothingWhenItsPlayingTheWebsitesBuild() throws Exception {
        File inUse = installed(website());
        Website site = new Website(website());
        String result = update(apk(), site, inUse);
        assertTrue(result, result.contains("Playing"));
        assertEquals(Collections.emptyList(), site.downloads());
        assertEquals(inUse, SiteGames.pick(sites, "0.30.0"));
    }

    @Test
    public void movesOnFromOneWebsiteBuildToTheNextCopyingWhatItCan() throws Exception {
        File inUse = installed(website());
        Build next = new Build("0.30.1-cccccccc").file("index.html", "<html>next")
                .file("assets/new.js", "new").chunk("chunk three");
        Website site = new Website(next);
        update(apk(), site, inUse);
        // Its files were in the build being played, not the APK
        assertEquals(Collections.singletonList("index.html"), site.downloads());
        File folder = SiteGames.pick(sites, "0.30.0");
        assertEquals(new File(sites, "0.30.1-cccccccc"), folder);
        // The old one stays while it's played, and goes at the next launch
        assertTrue(inUse.isDirectory());
        SiteGames.update(BASE, site, sites, apk().game(), APK_BUILD, "0.30.0", folder, ADDRESSES, () -> false);
        assertEquals(Arrays.asList("0.30.1-cccccccc", SiteGames.CURRENT), sitesList());
    }

    @Test
    public void withNoWebsiteItClearsWhatsThere() throws Exception {
        installed(website());
        Website site = new Website(website());
        String result = SiteGames.update(null, site, sites, apk().game(), APK_BUILD, "0.30.0", null, ADDRESSES,
                () -> false);
        assertTrue(result, result.contains("No website"));
        assertEquals(Collections.emptyList(), site.asked);
        assertEquals(Collections.emptyList(), sitesList());
    }

    // Installs a build and makes it current, as an earlier launch would have
    private File installed(Build build) throws Exception {
        File folder = SiteGames.install(build.site(), BASE, sites, Collections.singletonList(apk().game()),
                new Website(build), () -> false, 2);
        SiteGames.setCurrent(sites, build.build);
        return folder;
    }

    @Test
    public void picksOnlyAFinishedBuildNoOlderThanTheApk() throws Exception {
        assertNull(SiteGames.pick(sites, "0.30.0"));
        File folder = installed(website());
        assertEquals(folder, SiteGames.pick(sites, "0.30.0"));
        assertEquals(folder, SiteGames.pick(sites, "0.29.0"));
        // A newer APK plays its own game
        assertNull(SiteGames.pick(sites, "0.30.1"));
        // A folder that's lost its marker or index.html isn't a finished install
        File marker = new File(folder, SiteFiles.MARKER);
        byte[] saved = Files.readAllBytes(marker.toPath());
        assertTrue(marker.delete());
        assertNull(SiteGames.pick(sites, "0.30.0"));
        Files.write(marker.toPath(), saved);
        assertTrue(new File(folder, "index.html").delete());
        assertNull(SiteGames.pick(sites, "0.30.0"));
    }

    @Test
    public void picksNothingFromABadPointer() throws Exception {
        installed(website());
        Files.write(new File(sites, SiteGames.CURRENT).toPath(), bytes("../" + SITE_BUILD));
        assertNull(SiteGames.pick(sites, "0.30.0"));
        Files.write(new File(sites, SiteGames.CURRENT).toPath(), bytes("0.30.0-cccccccc"));
        assertNull(SiteGames.pick(sites, "0.30.0"));
        // A folder whose marker is for another build
        File other = new File(sites, "0.30.0-cccccccc");
        assertTrue(new File(sites, SITE_BUILD).renameTo(other));
        assertNull(SiteGames.pick(sites, "0.30.0"));
    }

    @Test
    public void keepsOnlyTheBuildInUse() throws Exception {
        File inUse = installed(website());
        assertTrue(new File(sites, SiteGames.PARTIAL).mkdirs());
        assertTrue(new File(sites, "0.29.0-dddddddd").mkdirs());
        SiteGames.removeOthers(sites, inUse);
        assertEquals(Arrays.asList(SITE_BUILD, SiteGames.CURRENT), sitesList());
    }

    @Test
    public void readsABuildJson() {
        assertEquals(APK_BUILD, SiteGames.readBuild(new ByteArrayInputStream(bytes("{\"build\":\"" + APK_BUILD + "\"}"))));
        assertNull(SiteGames.readBuild(new ByteArrayInputStream(bytes("{\"build\":5}"))));
        assertNull(SiteGames.readBuild(new ByteArrayInputStream(bytes("<html>"))));
        assertNull(SiteGames.readBuild(null));
    }

    @Test
    public void neverResolvesOutsideTheFolder() throws IOException {
        File root = temporary.newFolder("root");
        assertNotNull(SiteGames.resolve(root, "a/b.js"));
        for (String path : new String[]{"../x", "a/../../x", ""}) {
            try {
                SiteGames.resolve(root, path);
                fail(path);
            } catch (IOException expected) {
                // Refused
            }
        }
    }

    @Test
    public void readsTextOnlyUpToItsLimit() throws IOException {
        assertEquals("abc", SiteGames.readText(new ByteArrayInputStream(bytes("abc")), 3));
        try {
            SiteGames.readText(new ByteArrayInputStream(bytes("abcd")), 3);
            fail("Read past the limit");
        } catch (IOException expected) {
            // Refused
        }
        assertArrayEquals(bytes("x"), bytes(SiteGames.readText(new ByteArrayInputStream(bytes("x")), 1)));
    }
}
