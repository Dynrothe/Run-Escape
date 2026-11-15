const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { dirname, join, resolve } = require("node:path");

/** @param {string} root */
function ensureSharedCache(root = process.cwd()) {
    const caches = resolve(root, "caches");
    // lstat also preserves a broken link: don't replace a developer's cache.
    try {
        fs.lstatSync(caches);
        return caches;
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
    const git = join(root, ".git");
    if (!fs.existsSync(git) || !fs.statSync(git).isFile()) {
        return caches;
    }
    const commonDir = execFileSync(
        "git",
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const shared = join(dirname(commonDir), "caches");
    if (shared === caches || !fs.existsSync(shared)) {
        return caches;
    }
    if (!fs.statSync(shared).isDirectory()) {
        throw new Error(`The main repository's cache is not a directory: ${shared}`);
    }
    try {
        // Windows junctions don't require symlink privileges.
        fs.symlinkSync(shared, caches, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
        // Multiple test workers or tools can start in the same worktree.
        if (
            error.code !== "EEXIST" ||
            fs.realpathSync.native(caches) !== fs.realpathSync.native(shared)
        ) {
            throw error;
        }
    }
    return caches;
}

module.exports = { ensureSharedCache };
