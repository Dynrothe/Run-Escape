// Only run membership is persisted. Frames stay in the host's bounded memory buffer.
import { randomBytes } from "node:crypto";
import {
    closeSync,
    existsSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmdirSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export const RECOVERY_WINDOW_MS = 120_000;
const LEASE_MS = 15_000;
const MAX_RECORD_BYTES = 256 * 1024;
const RUN_ID = /^[a-f0-9]{32}$/;

// A PID can be reused (and a restarted container often has PID 1 again).
function processIdentity(pid) {
    if (process.platform !== "linux") return undefined;
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${start}`;
}

export function createRecoveryStore(path, maxRooms = 500) {
    const directory = resolve(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(directory);
    if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (process.getuid && (stat.uid !== process.getuid() || stat.mode & 0o077))
    ) {
        throw new Error("Recovery directory must be private and owned by the server account");
    }
    const lockPath = join(directory, "server.lock");
    const guard = join(directory, "starting.lock");
    // Serializes stale-lock reclamation as well as fresh startup.
    mkdirSync(guard, { mode: 0o700 });
    let lock;
    try {
        if (existsSync(lockPath)) {
            const previous = JSON.parse(readFileSync(lockPath, "utf8"));
            if (!Number.isInteger(previous.pid) || previous.pid <= 0)
                throw new Error("Invalid recovery lock");
            try {
                process.kill(previous.pid, 0);
                if (!previous.identity || previous.identity === processIdentity(previous.pid))
                    throw new Error("Another relay owns the recovery directory");
            } catch (error) {
                if (error.code !== "ESRCH") throw error;
            }
            unlinkSync(lockPath);
        }
        lock = openSync(lockPath, "wx", 0o600);
        writeFileSync(
            lock,
            JSON.stringify({ pid: process.pid, identity: processIdentity(process.pid) }),
        );
    } catch (error) {
        if (lock !== undefined) {
            closeSync(lock);
            unlinkSync(lockPath);
        }
        throw error;
    } finally {
        rmdirSync(guard);
    }
    const atomicWrite = (name, value) => {
        const data = JSON.stringify(value);
        if (Buffer.byteLength(data) > MAX_RECORD_BYTES)
            throw new Error("Recovery record too large");
        const target = join(directory, name);
        const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
        try {
            writeFileSync(temp, data, { flag: "wx", mode: 0o600 });
            renameSync(temp, target);
        } finally {
            try {
                unlinkSync(temp);
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
        }
    };
    const records = [];
    let closed = false;
    let timer;
    const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        process.off("exit", close);
        closeSync(lock);
        unlinkSync(lockPath);
    };
    try {
        let lease = 0;
        try {
            lease = JSON.parse(readFileSync(join(directory, "lease.json"), "utf8")).until;
        } catch (error) {
            if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
        }
        for (const name of readdirSync(directory)) {
            const id = name.slice(0, -5);
            if (!name.endsWith(".json") || !RUN_ID.test(id)) continue;
            const file = join(directory, name);
            const info = lstatSync(file);
            if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_RECORD_BYTES)
                throw new Error("Invalid recovery record");
            const record = JSON.parse(readFileSync(file, "utf8"));
            const deadline = Math.min(
                record.deadline ?? Infinity,
                lease,
                Date.now() + RECOVERY_WINDOW_MS,
            );
            if (Number.isFinite(deadline) && deadline > Date.now() && records.length < maxRooms) {
                if (record.version !== 1 || record.runId !== id)
                    throw new Error("Unsupported recovery record");
                const restored = { ...record, deadline };
                // Another restart must not give an already interrupted run more time.
                atomicWrite(name, restored);
                records.push(restored);
            } else unlinkSync(file);
        }
        const heartbeat = () =>
            atomicWrite("lease.json", { until: Date.now() + RECOVERY_WINDOW_MS + LEASE_MS });
        heartbeat();
        let failure;
        timer = setInterval(() => {
            try {
                heartbeat();
            } catch (error) {
                failure = error;
                clearInterval(timer);
            }
        }, LEASE_MS);
        timer.unref();
        process.once("exit", close);
        return {
            records,
            save(record) {
                if (closed || failure) throw failure ?? new Error("Recovery store closed");
                if (!RUN_ID.test(record.runId)) throw new Error("Invalid run ID");
                atomicWrite(`${record.runId}.json`, record);
            },
            remove(runId) {
                if (!RUN_ID.test(runId)) throw new Error("Invalid run ID");
                try {
                    unlinkSync(join(directory, `${runId}.json`));
                } catch (error) {
                    if (error.code !== "ENOENT") throw error;
                }
            },
            close,
        };
    } catch (error) {
        close();
        throw error;
    }
}
