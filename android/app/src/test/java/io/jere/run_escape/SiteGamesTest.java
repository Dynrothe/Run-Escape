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
import java.io.FilterInputStream;
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
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

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
    private FakeDevice device;

    @Before
    public void setUp() throws IOException {
        sites = temporary.newFolder("site");
        device = new FakeDevice();
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private static String sha256(byte[] data) {
        java.security.MessageDigest digest = SiteGames.sha256();
        return SiteGames.hex(digest.digest(data));
    }

    private static String chunkName(String text) {
        return sha256(bytes(text)).substring(0, 32) + ".bin";
    }

    /** The phone: closing or not, on mobile data or not, and its free space */
    private static final class FakeDevice implements SiteGames.Device {
        final AtomicBoolean cancelled = new AtomicBoolean();
        volatile boolean metered;
        volatile long usable = 64L * 1024 * 1024 * 1024;

        @Override public boolean cancelled() { return cancelled.get(); }

        @Override public boolean metered() { return metered; }

        @Override public long usableSpace() { return usable; }
    }

    /** A build's files, its game-files.json and caches.json, and the website or game holding them */
    private static final class Build {
        final String build;
        final Map<String, byte[]> files = new LinkedHashMap<>();
        final Map<String, byte[]> chunks = new LinkedHashMap<>();
        String coopUrl = COOP;
        String minAndroid = "0.0.0";

        Build(String build) {
            this.build = build;
        }

        Build file(String path, String text) {
            files.put(path, bytes(text));
            return this;
        }

        Build chunk(String text) {
            chunks.put(chunkName(text), bytes(text));
            return this;
        }

        String filesJson() throws JSONException {
            JSONArray list = new JSONArray();
            for (Map.Entry<String, byte[]> file : files.entrySet()) {
                list.put(new JSONObject().put("path", file.getKey()).put("sha256", sha256(file.getValue()))
                        .put("size", file.getValue().length));
            }
            return new JSONObject().put("build", build).put("version", SiteFiles.versionOf(build))
                    .put("minLauncher", "9.9.9").put("minAndroid", minAndroid).put("coopUrl", coopUrl)
                    .put("runAnalyticsUrl", "").put("cloudSaveUrl", "").put("files", list).toString();
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
            files.removeIf(file -> file.equals(SiteFiles.NAME) || file.equals("caches/caches.json"));
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

    private static final Set<String> APK_CHUNKS = apk().chunks.keySet();

    private static SiteGames.Apk apkOf(Build build, String version) throws JSONException {
        return new SiteGames.Apk(build.game(), build.build, version, build.chunks.keySet());
    }

    private static String read(File file) throws IOException {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private String update(Build apk, SiteGames.Fetcher site, File inUse) throws JSONException {
        return SiteGames.update(BASE, site, sites, apkOf(apk, "0.30.0"), inUse, ADDRESSES, device);
    }

    private File install(Build build, SiteGames.Fetcher site, int downloads) throws Exception {
        return SiteGames.install(build.site(), BASE, sites, Collections.singletonList(apk().game()), APK_CHUNKS,
                site, device, downloads);
    }

    private File pick(String apkVersion) {
        return SiteGames.pick(sites, apkVersion, APK_CHUNKS);
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
        // The shared script's copied though it's called something else
        assertEquals(Arrays.asList("assets/new.js", "caches/chunks/" + chunkName("chunk three"),
                "index.html"), site.downloads());
        File folder = new File(sites, SITE_BUILD);
        assertEquals("<html>new", read(new File(folder, "index.html")));
        assertEquals("shared", read(new File(folder, "assets/renamed.js")));
        // The APK's chunk is served from the APK rather than kept twice, and only the new one's here
        assertFalse(new File(folder, "caches/chunks/" + chunkName("chunk one")).exists());
        assertEquals("chunk three", read(new File(folder, "caches/chunks/" + chunkName("chunk three"))));
        assertEquals(website.cachesJson(), read(new File(folder, "caches/caches.json")));
        assertFalse(new File(folder, "assets/old.js").exists());
        assertEquals(Arrays.asList(SITE_BUILD, SiteGames.CURRENT), sitesList());
        // Played from the next start, as long as the APK has the chunk it lacks
        assertEquals(folder, pick("0.30.0"));
        assertNull(SiteGames.pick(sites, "0.30.0", Collections.emptySet()));
    }

    @Test
    public void downloadsEverythingWhenTheGameHasNoList() throws Exception {
        Build apk = apk();
        Map<String, byte[]> all = apk.everything();
        SiteGames.Game unlisted = new SiteGames.Game(path -> all.containsKey(path)
                ? new ByteArrayInputStream(all.get(path)) : null, null);
        Website site = new Website(website());
        SiteGames.install(website().site(), BASE, sites, Collections.singletonList(unlisted),
                Collections.emptySet(), site, device, 2);
        // Chunks are still found by name
        assertEquals(Arrays.asList("assets/new.js", "assets/renamed.js",
                "caches/chunks/" + chunkName("chunk three"), "index.html"), site.downloads());
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
        File folder = SiteGames.install(website().site(), BASE, sites, Collections.singletonList(game),
                APK_CHUNKS, site, device, 2);
        assertTrue(site.downloads().contains("assets/renamed.js"));
        assertEquals("shared", read(new File(folder, "assets/renamed.js")));
    }

    private void assertInstallFails(Website site) throws Exception {
        try {
            install(website(), site, 2);
            fail("Installed");
        } catch (IOException expected) {
            // Nothing's played, and what's done is kept for the next try
        }
        assertEquals(Collections.singletonList(SiteGames.PARTIAL), sitesList());
        assertNull(pick("0.30.0"));
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
        site.answers.put(BASE + "caches/chunks/" + chunkName("chunk three"), bytes("chunk thref"));
        assertInstallFails(site);
    }

    @Test
    public void aMissingFileStopsTheInstall() throws Exception {
        Website site = new Website(website());
        site.answers.remove(BASE + "assets/new.js");
        assertInstallFails(site);
    }

    @Test
    public void anUnfinishedDownloadGoesOnFromWhereItStopped() throws Exception {
        Website broken = new Website(website());
        broken.answers.remove(BASE + "assets/new.js");
        try {
            // One at a time, so index.html's done before new.js fails
            install(website(), broken, 1);
            fail("Installed");
        } catch (IOException expected) {
            // Stopped at new.js
        }
        Website site = new Website(website());
        File folder = install(website(), site, 1);
        assertEquals(Arrays.asList("assets/new.js", "caches/chunks/" + chunkName("chunk three")),
                site.downloads());
        assertEquals("<html>new", read(new File(folder, "index.html")));
    }

    @Test
    public void whatsLeftOfAnotherBuildIsThrownAway() throws Exception {
        Website broken = new Website(website());
        broken.answers.remove(BASE + "assets/new.js");
        try {
            install(website(), broken, 1);
            fail("Installed");
        } catch (IOException expected) {
            // Left .partial for this build
        }
        Files.write(new File(sites, SiteGames.PARTIAL + "/stray.txt").toPath(), bytes("stray"));
        Build next = new Build("0.30.1-cccccccc").file("index.html", "<html>new").chunk("chunk one");
        Website site = new Website(next);
        File folder = install(next, site, 1);
        // Even a file of the same name and bytes is downloaded again, and nothing else is kept
        assertEquals(Collections.singletonList("index.html"), site.downloads());
        assertFalse(new File(folder, "stray.txt").exists());
    }

    @Test
    public void aBuildTooBigForThePhoneIsntStarted() throws Exception {
        Build huge = website();
        JSONObject files = new JSONObject(huge.filesJson());
        files.getJSONArray("files").getJSONObject(0).put("size", SiteGames.MAX_BUILD_BYTES + 1);
        Website site = new Website(huge);
        try {
            SiteGames.install(new SiteGames.SiteBuild(files.toString(), huge.cachesJson()), BASE, sites,
                    Collections.singletonList(apk().game()), APK_CHUNKS, site, device, 2);
            fail("Installed");
        } catch (IOException expected) {
            // Refused before anything's asked for
        }
        assertEquals(Collections.emptyList(), site.asked);
    }

    @Test
    public void aBuildThatWouldFillThePhoneIsntStarted() throws Exception {
        // What's downloaded or copied: index.html, both scripts and the new chunk
        long size = 9 + 6 + 3 + 11;
        Website site = new Website(website());
        device.usable = SiteGames.KEEP_FREE_BYTES + size - 1;
        try {
            install(website(), site, 2);
            fail("Installed");
        } catch (IOException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("space"));
        }
        assertEquals(Collections.emptyList(), site.asked);
        assertEquals(Collections.emptyList(), sitesList());
        device.usable = SiteGames.KEEP_FREE_BYTES + size;
        assertNotNull(install(website(), site, 2));
    }

    @Test
    public void aPhoneOutOfSpaceGetsBackWhatAnEarlierTryLeft() throws Exception {
        File partial = new File(sites, SiteGames.PARTIAL);
        assertTrue(partial.mkdirs());
        Files.write(new File(partial, SiteFiles.MARKER).toPath(), bytes(website().filesJson()));
        Files.write(new File(partial, "index.html").toPath(), bytes("<html>new"));
        device.usable = SiteGames.KEEP_FREE_BYTES - 1;
        try {
            install(website(), new Website(website()), 2);
            fail("Installed");
        } catch (IOException expected) {
            assertTrue(expected.getMessage(), expected.getMessage().contains("space"));
        }
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void closingTheAppKeepsWhatsDoneForTheNextTry() throws Exception {
        Website site = new Website(website());
        SiteGames.Fetcher closing = url -> {
            device.cancelled.set(true);
            return site.open(url);
        };
        try {
            install(website(), closing, 1);
            fail("Installed");
        } catch (SiteGames.CancelledException expected) {
            // Stopped
        }
        assertEquals(Collections.singletonList(SiteGames.PARTIAL), sitesList());
        // The copy made before the downloads stays
        assertEquals("shared", read(new File(sites, SiteGames.PARTIAL + "/assets/renamed.js")));
        assertNull(pick("0.30.0"));
    }

    @Test
    public void onMobileDataItWaitsForWifi() throws Exception {
        Website site = new Website(website());
        device.metered = true;
        String result = update(apk(), site, null);
        assertTrue(result, result.contains("Wi-Fi"));
        // Only the lists, which are small
        assertEquals(Collections.emptyList(), site.downloads());
        assertNull(pick("0.30.0"));
        device.metered = false;
        result = update(apk(), site, null);
        assertTrue(result, result.contains("Downloaded"));
        assertEquals(Arrays.asList("assets/new.js", "caches/chunks/" + chunkName("chunk three"),
                "index.html"), site.downloads());
    }

    @Test
    public void aPhoneMovingOntoMobileDataStopsAfterTheFileItsOn() throws Exception {
        Website site = new Website(website());
        SiteGames.Fetcher moving = url -> {
            device.metered = true;
            return site.open(url);
        };
        try {
            install(website(), moving, 1);
            fail("Installed");
        } catch (SiteGames.MeteredException expected) {
            // Waits for Wi-Fi
        }
        assertEquals(Collections.singletonList("index.html"), site.downloads());
    }

    @Test
    public void anInterruptedInstallWaitsForItsDownloadsToStop() throws Exception {
        CountDownLatch asked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean stopped = new AtomicBoolean();
        Website site = new Website(website());
        SiteGames.Fetcher slow = url -> {
            if (!url.endsWith("new.js")) return site.open(url);
            asked.countDown();
            // As a socket read can't be interrupted
            while (true) {
                try {
                    release.await();
                    break;
                } catch (InterruptedException ignored) {
                    // Goes on waiting
                }
            }
            return new FilterInputStream(site.open(url)) {
                @Override public void close() throws IOException {
                    super.close();
                    stopped.set(true);
                }
            };
        };
        Thread installing = new Thread(() -> {
            try {
                install(website(), slow, 1);
            } catch (Exception ignored) {
                // Cancelled
            }
        });
        installing.start();
        assertTrue(asked.await(10, TimeUnit.SECONDS));
        device.cancelled.set(true);
        installing.interrupt();
        Thread.sleep(200);
        // Still waiting for the download it can't stop, which would otherwise write into .partial
        // while the next update used it
        assertTrue(installing.isAlive());
        release.countDown();
        installing.join(10000);
        assertFalse(installing.isAlive());
        assertTrue(stopped.get());
    }

    @Test
    public void offlineNothingChanges() throws Exception {
        File inUse = installed(website());
        SiteGames.Fetcher offline = url -> {
            throw new IOException("No network");
        };
        String result = update(apk(), offline, inUse);
        assertTrue(result, result.contains("skipped"));
        assertEquals(inUse, pick("0.30.0"));
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
        String result = SiteGames.update(BASE, site, sites, apkOf(apk(), "0.30.1"), null, ADDRESSES, device);
        assertTrue(result, result.contains("older"));
        assertEquals(Collections.emptyList(), site.downloads());
    }

    @Test
    public void wontFollowABuildThatNeedsANewerApp() throws Exception {
        Build website = website();
        website.minAndroid = "0.30.1";
        Website site = new Website(website);
        String result = update(apk(), site, null);
        assertTrue(result, result.contains("needs the Android app's 0.30.1"));
        assertEquals(Collections.emptyList(), site.downloads());
        assertEquals(Collections.emptyList(), sitesList());
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
        // The APK's game from the next start, which clears the old folder
        assertNull(pick("0.30.0"));
        SiteGames.removeOthers(sites, null, true);
        assertEquals(Collections.emptyList(), sitesList());
    }

    @Test
    public void downloadsNothingWhenItsPlayingTheWebsitesBuild() throws Exception {
        File inUse = installed(website());
        Website site = new Website(website());
        String result = update(apk(), site, inUse);
        assertTrue(result, result.contains("Playing"));
        assertEquals(Collections.emptyList(), site.downloads());
        assertEquals(inUse, pick("0.30.0"));
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
        File folder = pick("0.30.0");
        assertEquals(new File(sites, "0.30.1-cccccccc"), folder);
        // The old one stays while it's played, and goes at the next start
        assertTrue(inUse.isDirectory());
        update(apk(), site, folder);
        assertEquals(Arrays.asList("0.30.1-cccccccc", SiteGames.CURRENT), sitesList());
    }

    @Test
    public void withNoWebsiteItClearsWhatsThere() throws Exception {
        installed(website());
        assertTrue(new File(sites, SiteGames.PARTIAL).mkdirs());
        Website site = new Website(website());
        String result = SiteGames.update(null, site, sites, apkOf(apk(), "0.30.0"), null, ADDRESSES, device);
        assertTrue(result, result.contains("No website"));
        assertEquals(Collections.emptyList(), site.asked);
        assertEquals(Collections.emptyList(), sitesList());
    }

    // Installs a build and makes it current, as an earlier launch would have
    private File installed(Build build) throws Exception {
        File folder = install(build, new Website(build), 2);
        SiteGames.setCurrent(sites, build.build);
        return folder;
    }

    @Test
    public void picksOnlyAWholeBuildNoOlderThanTheApk() throws Exception {
        assertNull(pick("0.30.0"));
        File folder = installed(website());
        assertEquals(folder, pick("0.30.0"));
        assertEquals(folder, pick("0.29.0"));
        // A newer APK plays its own game
        assertNull(pick("0.30.1"));
        // A folder that's lost its marker isn't a finished install
        File marker = new File(folder, SiteFiles.MARKER);
        byte[] saved = Files.readAllBytes(marker.toPath());
        assertTrue(marker.delete());
        assertNull(pick("0.30.0"));
        Files.write(marker.toPath(), saved);
        assertEquals(folder, pick("0.30.0"));
        // Nor is one with a file emptied, as a lost write leaves it
        File script = new File(folder, "assets/new.js");
        Files.write(script.toPath(), new byte[0]);
        assertNull(pick("0.30.0"));
        Files.write(script.toPath(), bytes("new"));
        assertEquals(folder, pick("0.30.0"));
        // Or one missing a chunk the APK hasn't
        assertTrue(new File(folder, "caches/chunks/" + chunkName("chunk three")).delete());
        assertNull(pick("0.30.0"));
    }

    @Test
    public void picksNothingFromABadPointer() throws Exception {
        installed(website());
        Files.write(new File(sites, SiteGames.CURRENT).toPath(), bytes("../" + SITE_BUILD));
        assertNull(pick("0.30.0"));
        Files.write(new File(sites, SiteGames.CURRENT).toPath(), bytes("0.30.0-cccccccc"));
        assertNull(pick("0.30.0"));
        // A folder whose marker is for another build
        File other = new File(sites, "0.30.0-cccccccc");
        assertTrue(new File(sites, SITE_BUILD).renameTo(other));
        assertNull(pick("0.30.0"));
    }

    @Test
    public void keepsOnlyTheBuildInUse() throws Exception {
        File inUse = installed(website());
        assertTrue(new File(sites, SiteGames.PARTIAL).mkdirs());
        assertTrue(new File(sites, "0.29.0-dddddddd").mkdirs());
        SiteGames.removeOthers(sites, inUse, true);
        assertEquals(Arrays.asList(SiteGames.PARTIAL, SITE_BUILD, SiteGames.CURRENT), sitesList());
        SiteGames.removeOthers(sites, inUse, false);
        assertEquals(Arrays.asList(SITE_BUILD, SiteGames.CURRENT), sitesList());
    }

    @Test
    public void readsABuildJson() {
        String buildJson = "{\"build\":\"" + APK_BUILD + "\"}";
        assertEquals(APK_BUILD, SiteGames.readBuild(new ByteArrayInputStream(bytes(buildJson))));
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
}
