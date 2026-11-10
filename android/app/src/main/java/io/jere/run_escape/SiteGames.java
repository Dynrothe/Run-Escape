package io.jere.run_escape;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * Keeps the app on the website's build (SiteFiles), in sitesDir (filesDir/site): each finished
 * install in a folder named after its build, "current" naming the one to play, and ".partial" while
 * one's being put together. The game's served from the same origin whichever folder it's in
 * (GamePathHandler), so saves stay where they are. A build downloaded on one visit is played from
 * the next time the app opens: the game in front never changes under the player. No Android
 * dependencies, for local tests; SiteUpdater gives it the network and the APK's files.
 */
final class SiteGames {
    static final String CURRENT = "current";
    static final String PARTIAL = ".partial";
    // More than a build could be: the APK holds 256 MB at most (scripts/android/prepare-game.ts)
    static final long MAX_BUILD_BYTES = 512L * 1024 * 1024;
    // game-files.json and caches.json are lists, nowhere near this
    static final int MAX_LIST_BYTES = 16 * 1024 * 1024;
    // Files downloaded at once: most are small, and they're all from the one server
    static final int DOWNLOADS = 4;

    private SiteGames() { }

    /** A game folder's files: the APK's game, or an installed folder. */
    interface Source {
        /** The file at this path inside the game's folder, or null when there isn't one */
        InputStream open(String path) throws IOException;
    }

    /** The website. Gives the body of a 200 at url, and throws for anything else, redirects too. */
    interface Fetcher {
        InputStream open(String url) throws IOException;
    }

    /** A game to copy files from rather than download them: its files, and its list if it has one. */
    static final class Game {
        final Source source;
        final SiteFiles listed;

        Game(Source source, SiteFiles listed) {
            this.source = source;
            this.listed = listed;
        }
    }

    /** What the website's on: its game-files.json and caches.json, as sent and as read. */
    static final class SiteBuild {
        final String filesText;
        final SiteFiles files;
        final String cachesText;
        final List<SiteFiles.Chunk> chunks;

        SiteBuild(String filesText, String cachesText) throws JSONException {
            this.filesText = filesText;
            this.files = SiteFiles.parse(filesText);
            this.cachesText = cachesText;
            this.chunks = SiteFiles.parseCaches(cachesText, files.build);
        }
    }

    /** The relay, run collector and cloud saves the app lets out (RelayPolicy), "" for none. */
    static final class Addresses {
        final String coopUrl;
        final String runAnalyticsUrl;
        final String cloudSaveUrl;

        Addresses(String coopUrl, String runAnalyticsUrl, String cloudSaveUrl) {
            this.coopUrl = coopUrl;
            this.runAnalyticsUrl = runAnalyticsUrl;
            this.cloudSaveUrl = cloudSaveUrl;
        }
    }

    /** Stopped because the app closed, or another download failed */
    static final class CancelledException extends IOException {
        CancelledException() { super("Cancelled"); }
    }

    static Source folderSource(File folder) {
        return path -> {
            try {
                return new FileInputStream(resolve(folder, path));
            } catch (FileNotFoundException exception) {
                return null;
            }
        };
    }

    // The file at a relative path, which has to stay inside root
    static File resolve(File root, String path) throws IOException {
        File file = new File(root, path);
        String inside = root.getCanonicalPath() + File.separator;
        if (path.isEmpty() || !file.getCanonicalPath().startsWith(inside)) {
            throw new IOException("Unsafe path: " + path);
        }
        return file;
    }

    /** The build a game folder's build.json says it is, or null */
    static String readBuild(InputStream buildJson) {
        if (buildJson == null) return null;
        try (InputStream input = buildJson) {
            Object build = new JSONObject(readText(input, 64 * 1024)).opt("build");
            return SiteFiles.isBuildId(build) ? (String) build : null;
        } catch (Exception exception) {
            return null;
        }
    }

    /** What a finished install was made from, or null when the folder isn't one */
    static SiteFiles readMarker(File folder) {
        try (InputStream input = new FileInputStream(new File(folder, SiteFiles.MARKER))) {
            SiteFiles marker = SiteFiles.parse(readText(input, MAX_LIST_BYTES));
            boolean whole = marker.build.equals(folder.getName())
                    && new File(folder, "index.html").isFile()
                    && new File(folder, "caches/caches.json").isFile();
            return whole ? marker : null;
        } catch (Exception exception) {
            return null;
        }
    }

    /**
     * The installed website build to play, or null for the APK's game. It's the one "current"
     * names, finished, and no older than the APK's game: after installing a newer APK, that plays.
     */
    static File pick(File sitesDir, String apkVersion) {
        try (InputStream input = new FileInputStream(new File(sitesDir, CURRENT))) {
            String name = readText(input, 256).trim();
            if (!SiteFiles.isBuildId(name)) return null;
            File folder = new File(sitesDir, name);
            SiteFiles marker = readMarker(folder);
            return marker != null && SiteFiles.compareVersions(marker.version, apkVersion) >= 0
                    ? folder : null;
        } catch (Exception exception) {
            return null;
        }
    }

    /**
     * Clears everything but the folder in use: older builds, and whatever an interrupted download
     * left. With the APK's game in use, "current" goes too, as it named one that isn't played.
     */
    static void removeOthers(File sitesDir, File inUse) {
        File[] entries = sitesDir.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            boolean keep = inUse != null && (entry.getName().equals(inUse.getName())
                    || entry.getName().equals(CURRENT));
            if (!keep) deleteTree(entry);
        }
    }

    /** Plays this build from the next launch on. Written whole, then renamed over the old one. */
    static void setCurrent(File sitesDir, String build) throws IOException {
        File temporary = new File(sitesDir, CURRENT + ".tmp");
        Files.write(temporary.toPath(), build.getBytes(StandardCharsets.UTF_8));
        Files.move(temporary.toPath(), new File(sitesDir, CURRENT).toPath(),
                StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    static void clearCurrent(File sitesDir) {
        new File(sitesDir, CURRENT).delete();
    }

    /**
     * Brings the app to the website's build, for its next launch, and says what happened. Never
     * throws for the website: whatever goes wrong leaves the game as it was. inUse is the folder
     * being played (pick), null for the APK's.
     */
    static String update(String base, Fetcher fetch, File sitesDir, Game apk, String apkBuild,
                         String apkVersion, File inUse, Addresses addresses,
                         BooleanSupplier cancelled) {
        removeOthers(sitesDir, inUse);
        if (base == null) return "No website to follow";
        try {
            SiteBuild site = new SiteBuild(
                    readText(fetch.open(SiteFiles.fileUrl(base, SiteFiles.NAME)), MAX_LIST_BYTES),
                    readText(fetch.open(SiteFiles.fileUrl(base, "caches/caches.json")), MAX_LIST_BYTES));
            String why = site.files.whyNotFollow(apkVersion, addresses.coopUrl,
                    addresses.runAnalyticsUrl, addresses.cloudSaveUrl);
            if (why != null) return "Not following the website: " + why;
            String build = site.files.build;
            if (build.equals(apkBuild)) {
                // Back to the APK's game, from the next launch
                clearCurrent(sitesDir);
                return "The app's own game is the website's " + build;
            }
            if (inUse != null && inUse.getName().equals(build)) {
                return "Playing the website's " + build;
            }
            List<Game> reuse = new ArrayList<>();
            reuse.add(apk);
            if (inUse != null) reuse.add(new Game(folderSource(inUse), readMarker(inUse)));
            install(site, base, sitesDir, reuse, fetch, cancelled, DOWNLOADS);
            setCurrent(sitesDir, build);
            return "Downloaded the website's " + build + ", for the next launch";
        } catch (Exception exception) {
            return "The website's build skipped: " + exception;
        }
    }

    private interface Check {
        boolean matches(String sha256);
    }

    private static final class Job {
        final String url;
        final File target;
        final long size;
        final Check check;

        Job(String url, File target, long size, Check check) {
            this.url = url;
            this.target = target;
            this.size = size;
            this.check = check;
        }
    }

    /**
     * Downloads the website's build and installs it, and gives back its folder. Files the games in
     * reuse have (by sha256, whatever they're called, and chunks by name) are copied rather than
     * downloaded. Every file's checked, and nothing's in place until it's all there: until the
     * rename, a failure or a cancel leaves things as they were.
     */
    static File install(SiteBuild site, String base, File sitesDir, List<Game> reuse, Fetcher fetch,
                        BooleanSupplier cancelled, int downloads)
            throws IOException, InterruptedException {
        long total = 0;
        for (SiteFiles.Entry file : site.files.files) total += file.size;
        for (SiteFiles.Chunk chunk : site.chunks) total += chunk.size;
        if (total > MAX_BUILD_BYTES) throw new IOException("The website's build is " + total + " bytes");

        File partial = new File(sitesDir, PARTIAL);
        deleteTree(partial);
        if (!partial.mkdirs()) throw new IOException("Couldn't make " + partial);
        try {
            // Where each sha256 is in the games it can be copied from
            Map<String, Game> bySha = new HashMap<>();
            Map<String, String> pathBySha = new HashMap<>();
            for (Game game : reuse) {
                if (game == null || game.listed == null) continue;
                for (SiteFiles.Entry file : game.listed.files) {
                    if (!bySha.containsKey(file.sha256)) {
                        bySha.put(file.sha256, game);
                        pathBySha.put(file.sha256, file.path);
                    }
                }
            }

            List<Job> jobs = new ArrayList<>();
            for (SiteFiles.Entry file : site.files.files) {
                File target = resolve(partial, file.path);
                Check check = sha -> sha.equals(file.sha256);
                Game game = bySha.get(file.sha256);
                if (game == null || !copy(game, pathBySha.get(file.sha256), target, file.size, check, cancelled)) {
                    jobs.add(new Job(SiteFiles.fileUrl(base, file.path), target, file.size, check));
                }
            }
            for (SiteFiles.Chunk chunk : site.chunks) {
                File target = resolve(partial, chunk.path());
                Check check = sha -> (sha.substring(0, 32) + ".bin").equals(chunk.file);
                boolean copied = false;
                for (Game game : reuse) {
                    if (game != null && copy(game, chunk.path(), target, chunk.size, check, cancelled)) {
                        copied = true;
                        break;
                    }
                }
                if (!copied) jobs.add(new Job(SiteFiles.fileUrl(base, chunk.path()), target, chunk.size, check));
            }
            download(jobs, fetch, cancelled, downloads);

            File caches = resolve(partial, "caches/caches.json");
            caches.getParentFile().mkdirs();
            Files.write(caches.toPath(), site.cachesText.getBytes(StandardCharsets.UTF_8));
            Files.write(new File(partial, SiteFiles.MARKER).toPath(), site.filesText.getBytes(StandardCharsets.UTF_8));

            if (cancelled.getAsBoolean()) throw new CancelledException();
            File folder = new File(sitesDir, site.files.build);
            // Only a folder that never became "current" can be here: the one in use isn't replaced
            deleteTree(folder);
            Files.move(partial.toPath(), folder.toPath(), StandardCopyOption.ATOMIC_MOVE);
            if (readMarker(folder) == null) throw new IOException("The installed build isn't whole");
            return folder;
        } finally {
            deleteTree(partial);
        }
    }

    // A copy that isn't what it should be is downloaded instead
    private static boolean copy(Game game, String path, File target, long size, Check check,
                                BooleanSupplier cancelled) throws CancelledException {
        try (InputStream input = game.source.open(path)) {
            if (input == null) return false;
            write(input, target, size, check, cancelled);
            return true;
        } catch (CancelledException exception) {
            throw exception;
        } catch (Exception exception) {
            target.delete();
            return false;
        }
    }

    private static void download(List<Job> jobs, Fetcher fetch, BooleanSupplier cancelled, int downloads)
            throws IOException, InterruptedException {
        if (jobs.isEmpty()) return;
        AtomicBoolean failed = new AtomicBoolean();
        // Stops the others after the file they're on
        BooleanSupplier stop = () -> failed.get() || cancelled.getAsBoolean();
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(downloads, jobs.size()), task -> {
            Thread thread = new Thread(task, "SiteDownload");
            thread.setPriority(Thread.MIN_PRIORITY);
            thread.setDaemon(true);
            return thread;
        });
        try {
            List<Future<?>> results = new ArrayList<>();
            for (Job job : jobs) {
                results.add(pool.submit(() -> {
                    if (stop.getAsBoolean()) throw new CancelledException();
                    try (InputStream input = fetch.open(job.url)) {
                        write(input, job.target, job.size, job.check, stop);
                    } catch (CancelledException exception) {
                        throw exception;
                    } catch (IOException | RuntimeException exception) {
                        failed.set(true);
                        throw new IOException(job.url + ": " + exception.getMessage(), exception);
                    }
                    return null;
                }));
            }
            IOException first = null;
            for (Future<?> result : results) {
                try {
                    result.get();
                } catch (ExecutionException exception) {
                    Throwable cause = exception.getCause();
                    // The first real failure, rather than the ones it stopped
                    if (first == null || first instanceof CancelledException) {
                        first = cause instanceof IOException ? (IOException) cause : new IOException(cause);
                    }
                }
            }
            if (first != null) throw first;
            if (cancelled.getAsBoolean()) throw new CancelledException();
        } finally {
            pool.shutdownNow();
        }
    }

    // Writes exactly size bytes whose sha256 passes check, or throws
    private static void write(InputStream input, File target, long size, Check check, BooleanSupplier stop)
            throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Couldn't make " + parent);
        }
        MessageDigest digest = sha256();
        long written = 0;
        try (OutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (stop.getAsBoolean()) throw new CancelledException();
                written += read;
                if (written > size) throw new IOException("Longer than its " + size + " bytes");
                digest.update(buffer, 0, read);
                output.write(buffer, 0, read);
            }
        }
        if (written != size) throw new IOException(written + " bytes, not " + size);
        if (!check.matches(hex(digest.digest()))) throw new IOException("Not the file listed");
    }

    static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            out.append(Character.forDigit((b >> 4) & 0xf, 16)).append(Character.forDigit(b & 0xf, 16));
        }
        return out.toString();
    }

    static String readText(InputStream stream, int limit) throws IOException {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (output.size() + read > limit) throw new IOException("Longer than " + limit + " bytes");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    // Best effort, and never through a link
    static void deleteTree(File file) {
        if (!Files.isSymbolicLink(file.toPath()) && file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteTree(child);
        }
        file.delete();
    }
}
