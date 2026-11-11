package io.jere.run_escape;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * Keeps the app on the website's build (SiteFiles), in sitesDir (filesDir/site): each finished
 * install in a folder named after its build, "current" naming the one to play, and ".partial"
 * while one's being put together. The game's served from the same origin whichever folder it's in
 * (GamePathHandler), so saves stay where they are, and the cache's chunks the APK has are served
 * from the APK rather than kept twice. A build downloaded on one visit is played the next time the
 * game starts over (Restart game, or opening the app): the game in front never changes under the
 * player. No Android dependencies, for local tests; SiteUpdater gives it the network and the APK.
 */
final class SiteGames {
    static final String CURRENT = "current";
    static final String PARTIAL = ".partial";
    // More than a build could be: the APK holds 256 MB at most (scripts/android/prepare-game.ts)
    static final long MAX_BUILD_BYTES = 512L * 1024 * 1024;
    // Left free after an install, for the game's saves and the rest of the phone
    static final long KEEP_FREE_BYTES = 256L * 1024 * 1024;
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

    /** What the phone says, asked as an update goes. */
    interface Device {
        /** The app's closing: stop, keeping what's done for the next try */
        boolean cancelled();

        /** The network costs money (mobile data): the website's files wait for Wi-Fi */
        boolean metered();

        /** Free bytes where the builds go */
        long usableSpace();
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

    /** The APK's own game: its files and list, its build and version, and the chunks it has. */
    static final class Apk {
        final Game game;
        final String build;
        final String version;
        final Set<String> chunks;

        Apk(Game game, String build, String version, Set<String> chunks) {
            this.game = game;
            this.build = build;
            this.version = version;
            this.chunks = chunks;
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
    static class CancelledException extends IOException {
        CancelledException() { this("Cancelled"); }

        CancelledException(String message) { super(message); }
    }

    /** Stopped on mobile data, keeping what's done to go on with over Wi-Fi */
    static final class MeteredException extends CancelledException {
        MeteredException() { super("On mobile data: the website's files wait for Wi-Fi"); }
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
        try {
            Object build = new JSONObject(LimitedText.read(buildJson, 64 * 1024)).opt("build");
            return SiteFiles.isBuildId(build) ? (String) build : null;
        } catch (Exception exception) {
            return null;
        }
    }

    /** The list a folder was installed from (its marker), or null */
    static SiteFiles readList(File folder) {
        try (InputStream input = new FileInputStream(new File(folder, SiteFiles.MARKER))) {
            return SiteFiles.parse(LimitedText.read(input, MAX_LIST_BYTES));
        } catch (Exception exception) {
            return null;
        }
    }

    /**
     * What a finished install was made from, or null when the folder isn't a whole one: every file
     * its marker lists, and every chunk its caches.json does that the APK hasn't, is there at its
     * size. Their sha256s were checked as they were written; this is quick enough to run before the
     * game loads, and catches what a lost write or a full disk leaves, so a broken folder isn't
     * played: the APK's game is, and the next update installs it again.
     */
    static SiteFiles readInstall(File folder, Set<String> apkChunks) {
        try {
            SiteFiles marker = readList(folder);
            if (marker == null || !marker.build.equals(folder.getName())) return null;
            // The marker's paths were checked when it was read, so they stay inside the folder
            for (SiteFiles.Entry file : marker.files) {
                if (!hasSize(new File(folder, file.path), file.size)) return null;
            }
            String caches;
            try (InputStream input = new FileInputStream(new File(folder, "caches/caches.json"))) {
                caches = LimitedText.read(input, MAX_LIST_BYTES);
            }
            for (SiteFiles.Chunk chunk : SiteFiles.parseCaches(caches, marker.build)) {
                if (!apkChunks.contains(chunk.file) && !hasSize(new File(folder, chunk.path()), chunk.size)) {
                    return null;
                }
            }
            return marker;
        } catch (Exception exception) {
            return null;
        }
    }

    private static boolean hasSize(File file, long size) {
        return file.isFile() && file.length() == size;
    }

    /**
     * The installed website build to play, or null for the APK's game. It's the one "current"
     * names, whole (readInstall), and no older than the APK's game: after installing a newer APK,
     * that plays.
     */
    static File pick(File sitesDir, String apkVersion, Set<String> apkChunks) {
        try (InputStream input = new FileInputStream(new File(sitesDir, CURRENT))) {
            String name = LimitedText.read(input, 256).trim();
            if (!SiteFiles.isBuildId(name)) return null;
            File folder = new File(sitesDir, name);
            SiteFiles marker = readInstall(folder, apkChunks);
            return marker != null && SiteFiles.compareVersions(marker.version, apkVersion) >= 0
                    ? folder : null;
        } catch (Exception exception) {
            return null;
        }
    }

    /**
     * Clears everything but the folder in use: older builds, and with keepPartial false, what an
     * unfinished download left. With the APK's game in use, "current" goes too, as it named one
     * that isn't played.
     */
    static void removeOthers(File sitesDir, File inUse, boolean keepPartial) {
        File[] entries = sitesDir.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            String name = entry.getName();
            boolean keep = (inUse != null && (name.equals(inUse.getName()) || name.equals(CURRENT)))
                    || (keepPartial && name.equals(PARTIAL));
            if (!keep) deleteTree(entry);
        }
    }

    /** Plays this build from the next start on. Written whole, then renamed over the old one. */
    static void setCurrent(File sitesDir, String build) throws IOException {
        File temporary = new File(sitesDir, CURRENT + ".tmp");
        writeSynced(temporary, build.getBytes(StandardCharsets.UTF_8));
        Files.move(temporary.toPath(), new File(sitesDir, CURRENT).toPath(),
                StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    static void clearCurrent(File sitesDir) {
        new File(sitesDir, CURRENT).delete();
    }

    /**
     * Brings the app to the website's build, for the next time the game starts, and says what
     * happened. Never throws for the website: whatever goes wrong leaves the game as it was, and
     * an unfinished download where the next try goes on from. inUse is the folder being played
     * (pick), null for the APK's.
     */
    static String update(String base, Fetcher fetch, File sitesDir, Apk apk, File inUse,
                         Addresses addresses, Device device) {
        removeOthers(sitesDir, inUse, base != null);
        if (base == null) return "No website to follow";
        File partial = new File(sitesDir, PARTIAL);
        try {
            SiteBuild site = new SiteBuild(
                    LimitedText.read(fetch.open(SiteFiles.fileUrl(base, SiteFiles.NAME)), MAX_LIST_BYTES),
                    LimitedText.read(fetch.open(SiteFiles.fileUrl(base, "caches/caches.json")), MAX_LIST_BYTES));
            String why = site.files.whyNotFollow(apk.version, addresses.coopUrl,
                    addresses.runAnalyticsUrl, addresses.cloudSaveUrl);
            if (why != null) {
                deleteTree(partial);
                return "Not following the website: " + why;
            }
            String build = site.files.build;
            if (build.equals(apk.build)) {
                // Back to the APK's game, from the next start
                deleteTree(partial);
                clearCurrent(sitesDir);
                return "The app's own game is the website's " + build;
            }
            if (inUse != null && inUse.getName().equals(build)) {
                deleteTree(partial);
                return "Playing the website's " + build;
            }
            List<Game> reuse = new ArrayList<>();
            reuse.add(apk.game);
            if (inUse != null) reuse.add(new Game(folderSource(inUse), readList(inUse)));
            install(site, base, sitesDir, reuse, apk.chunks, fetch, device, DOWNLOADS);
            setCurrent(sitesDir, build);
            return "Downloaded the website's " + build + ", for the next start";
        } catch (MeteredException exception) {
            return "The website's build waits: " + exception.getMessage();
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
     * Downloads the website's build and installs it, and gives back its folder. The cache's chunks
     * the APK has aren't kept (GamePathHandler serves them from it). Files the games in reuse have
     * (by sha256, whatever they're called, and chunks by name) are copied rather than downloaded,
     * and what an earlier try at the same build left is kept. Every file's checked, and nothing's
     * played until it's all there: until the rename, a failure or a cancel leaves the game as it
     * was, and .partial for the next try.
     */
    static File install(SiteBuild site, String base, File sitesDir, List<Game> reuse, Set<String> apkChunks,
                        Fetcher fetch, Device device, int downloads)
            throws IOException, InterruptedException {
        List<SiteFiles.Chunk> chunks = new ArrayList<>();
        for (SiteFiles.Chunk chunk : site.chunks) {
            if (!apkChunks.contains(chunk.file)) chunks.add(chunk);
        }
        long total = 0;
        for (SiteFiles.Entry file : site.files.files) total += file.size;
        for (SiteFiles.Chunk chunk : chunks) total += chunk.size;
        if (total > MAX_BUILD_BYTES) throw new IOException("The website's build is " + total + " bytes");

        File partial = new File(sitesDir, PARTIAL);
        // An earlier try's folder is kept only if it was for this same list: its files are checked below
        if (!site.filesText.equals(readTextOrNull(new File(partial, SiteFiles.MARKER)))) deleteTree(partial);
        long free = device.usableSpace();
        if (free - Math.max(0, total - sizeOf(partial)) < KEEP_FREE_BYTES) {
            deleteTree(partial);
            throw new IOException("Not enough space for the website's build: " + total + " bytes, "
                    + free + " free");
        }
        if (!partial.isDirectory() && !partial.mkdirs()) throw new IOException("Couldn't make " + partial);
        // Says which list the folder's for. It's only played once it's renamed, after every check.
        writeSynced(new File(partial, SiteFiles.MARKER), site.filesText.getBytes(StandardCharsets.UTF_8));

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
            if (isAlready(target, file.size, check)) continue;
            Game game = bySha.get(file.sha256);
            if (game == null || !copy(game, pathBySha.get(file.sha256), target, file.size, check, device)) {
                jobs.add(new Job(SiteFiles.fileUrl(base, file.path), target, file.size, check));
            }
        }
        for (SiteFiles.Chunk chunk : chunks) {
            File target = resolve(partial, chunk.path());
            Check check = sha -> (sha.substring(0, 32) + ".bin").equals(chunk.file);
            if (isAlready(target, chunk.size, check)) continue;
            boolean copied = false;
            for (Game game : reuse) {
                if (game != null && copy(game, chunk.path(), target, chunk.size, check, device)) {
                    copied = true;
                    break;
                }
            }
            if (!copied) jobs.add(new Job(SiteFiles.fileUrl(base, chunk.path()), target, chunk.size, check));
        }
        // Only the downloads cost data: what's copied is kept for when there's Wi-Fi
        if (!jobs.isEmpty() && device.metered()) throw new MeteredException();
        download(jobs, fetch, device, downloads);

        File caches = resolve(partial, "caches/caches.json");
        caches.getParentFile().mkdirs();
        writeSynced(caches, site.cachesText.getBytes(StandardCharsets.UTF_8));

        if (device.cancelled()) throw new CancelledException();
        File folder = new File(sitesDir, site.files.build);
        // Only a folder that never became "current" can be here: the one in use isn't replaced
        deleteTree(folder);
        Files.move(partial.toPath(), folder.toPath(), StandardCopyOption.ATOMIC_MOVE);
        if (readInstall(folder, apkChunks) == null) {
            deleteTree(folder);
            throw new IOException("The installed build isn't whole");
        }
        return folder;
    }

    // A file an earlier try left, if it's still exactly the one listed
    private static boolean isAlready(File target, long size, Check check) {
        if (!hasSize(target, size)) return false;
        try (InputStream input = new FileInputStream(target)) {
            MessageDigest digest = sha256();
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
            return check.matches(hex(digest.digest()));
        } catch (IOException exception) {
            return false;
        }
    }

    // A copy that isn't what it should be is downloaded instead
    private static boolean copy(Game game, String path, File target, long size, Check check, Device device)
            throws CancelledException {
        try (InputStream input = game.source.open(path)) {
            if (input == null) return false;
            write(input, target, size, check, device::cancelled);
            return true;
        } catch (CancelledException exception) {
            throw exception;
        } catch (Exception exception) {
            target.delete();
            return false;
        }
    }

    private static void download(List<Job> jobs, Fetcher fetch, Device device, int downloads)
            throws IOException, InterruptedException {
        if (jobs.isEmpty()) return;
        AtomicBoolean failed = new AtomicBoolean();
        // Stops the others after the file they're on
        BooleanSupplier stop = () -> failed.get() || device.cancelled();
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
                    // A phone that's moved onto mobile data stops after the files it's on
                    if (device.metered()) throw new MeteredException();
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
            if (device.cancelled()) throw new CancelledException();
        } finally {
            pool.shutdownNow();
            awaitStopped(pool);
        }
    }

    // Waits for the downloads to stop (a closed app's connections are cut), so that none writes into
    // .partial once this returns, when the next update may be using it
    private static void awaitStopped(ExecutorService pool) {
        long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(2);
        boolean interrupted = false;
        while (!pool.isTerminated() && System.nanoTime() < deadline) {
            try {
                pool.awaitTermination(deadline - System.nanoTime(), TimeUnit.NANOSECONDS);
            } catch (InterruptedException exception) {
                interrupted = true;
            }
        }
        if (interrupted) Thread.currentThread().interrupt();
    }

    // Writes exactly size bytes whose sha256 passes check, through to the disk, or throws
    private static void write(InputStream input, File target, long size, Check check, BooleanSupplier stop)
            throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Couldn't make " + parent);
        }
        MessageDigest digest = sha256();
        long written = 0;
        try (FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (stop.getAsBoolean()) throw new CancelledException();
                written += read;
                if (written > size) throw new IOException("Longer than its " + size + " bytes");
                digest.update(buffer, 0, read);
                output.write(buffer, 0, read);
            }
            if (written != size) throw new IOException(written + " bytes, not " + size);
            if (!check.matches(hex(digest.digest()))) throw new IOException("Not the file listed");
            // So a power cut after the install can't leave it empty
            output.getFD().sync();
        }
    }

    // Written through to the disk before anything counts on it
    static void writeSynced(File file, byte[] data) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(data);
            output.getFD().sync();
        }
    }

    private static String readTextOrNull(File file) {
        try (InputStream input = new FileInputStream(file)) {
            return LimitedText.read(input, MAX_LIST_BYTES);
        } catch (IOException exception) {
            return null;
        }
    }

    // The bytes in a folder's files
    private static long sizeOf(File file) {
        if (Files.isSymbolicLink(file.toPath())) return 0;
        if (!file.isDirectory()) return file.length();
        long total = 0;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) total += sizeOf(child);
        return total;
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

    // Best effort, and never through a link
    static void deleteTree(File file) {
        if (!Files.isSymbolicLink(file.toPath()) && file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteTree(child);
        }
        file.delete();
    }
}
