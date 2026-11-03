import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createRecoveryStore } from "./recovery-store.mjs";

type Message = { t: string; [key: string]: any };
class Client {
    socket: WebSocket;
    messages: Message[] = [];
    waiters: { t: string; resolve: (m: Message) => void }[] = [];
    constructor(url: string) {
        this.socket = new WebSocket(url);
        this.socket.onmessage = ({ data }) => {
            const m = JSON.parse(String(data));
            const i = this.waiters.findIndex((w) => w.t === m.t);
            if (i < 0) this.messages.push(m);
            else this.waiters.splice(i, 1)[0].resolve(m);
        };
    }
    send(m: object) {
        this.socket.send(JSON.stringify(m));
    }
    next(t: string): Promise<Message> {
        const i = this.messages.findIndex((m) => m.t === t);
        return i < 0
            ? new Promise((resolve) => this.waiters.push({ t, resolve }))
            : Promise.resolve(this.messages.splice(i, 1)[0]);
    }
    async barrier() {
        this.send({ t: "ping" });
        await this.next("pong");
    }
}

describe("relay restart recovery over real sockets", () => {
    let directory: string;
    let child: ChildProcess | undefined;
    let url: string;
    let clients: Client[];
    const relayUrl = pathToFileURL(join(process.cwd(), "server/coop-relay.mjs")).href;
    async function start() {
        child = spawn(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                `
            import { createServer } from 'node:http';
            import { createRelay } from ${JSON.stringify(relayUrl)};
            const relay = createRelay({ metrics: false, recoveryDir: process.env.TEST_RECOVERY_DIR, roomUpdateMs: 0 });
            const server = createServer(); relay.attach(server);
            server.listen(0, '127.0.0.1', () => process.send(server.address().port));
        `,
            ],
            {
                env: { ...process.env, TEST_RECOVERY_DIR: directory },
                stdio: ["ignore", "ignore", "inherit", "ipc"],
            },
        );
        const [port] = await once(child, "message");
        url = `ws://127.0.0.1:${port}/coop`;
    }
    async function kill() {
        if (!child) return;
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
        child = undefined;
    }
    async function connect() {
        const client = new Client(url);
        clients.push(client);
        expect((await client.next("welcome")).recoveryVersion).toBe(1);
        return client;
    }
    async function party(legacy = false) {
        const host = await connect(),
            guest = await connect();
        const me = {
            build: "original-browser-build",
            recoveryVersion: 1,
            unlocks: { maps: ["lumbridge"] },
        };
        host.send({ t: "create", me });
        const { room } = await host.next("room");
        guest.send({
            t: "join",
            code: room.code,
            me: legacy ? { ...me, recoveryVersion: undefined } : me,
        });
        const joined = await guest.next("room");
        host.send({ t: "start", game: { seed: 17 } });
        const h = await host.next("start"),
            g = await guest.next("start");
        return { host, guest, h, g, room: joined.room };
    }
    async function resume(credentials: any, build = "original-browser-build") {
        const client = await connect();
        client.send({ t: "resume", ...credentials, build });
        return client;
    }
    beforeEach(async () => {
        directory = mkdtempSync(join(tmpdir(), "coop-recovery-"));
        clients = [];
        await start();
    });
    afterEach(async () => {
        for (const client of clients) client.socket.close();
        await kill();
        rmSync(directory, { recursive: true, force: true });
    });

    it("survives a killed process, authenticates seats, replays missing frames and resumes the same run", async () => {
        const { h, g, room } = await party();
        expect(h.recovery.token).not.toBe(g.recovery.token);
        const record = readFileSync(join(directory, `${h.recovery.runId}.json`), "utf8");
        expect(record).not.toContain(h.recovery.token);
        expect(record).not.toContain(g.recovery.token);
        await kill();
        await start();
        for (const credentials of [
            { ...h.recovery, token: "0".repeat(64) },
            { ...h.recovery, protocol: 2 },
        ]) {
            const bad = await resume(credentials);
            await bad.next("resumeRejected");
        }
        const wrongBuild = await resume(h.recovery, "newly-deployed-build");
        await wrongBuild.next("resumeRejected");
        const guest = await resume(g.recovery);
        expect((await guest.next("resumed")).you).toBe(room.members[1].id);
        const host = await resume(h.recovery);
        const restored = await host.next("resumed");
        expect(restored.room.code).toBe(room.code);
        expect(restored.you).toBe(room.hostId);
        expect(restored.room.members.map((m: any) => m.name)).toEqual(
            room.members.map((m: any) => m.name),
        );
        const sync = await host.next("recoverySync");
        await guest.next("recoverySync");
        const envelope = { runId: sync.runId, epoch: sync.epoch };
        host.send({ t: "down", d: { upTo: 999, events: [] } });
        host.send({ t: "recoveryState", ...envelope, frame: 20, hash: 123 });
        guest.send({ t: "recoveryState", ...envelope, frame: 10, hash: 456 });
        const request = await host.next("recoveryReplay");
        expect(request).toMatchObject({ to: room.members[1].id, frame: 10, target: 20 });
        host.send({
            t: "recoveryFrames",
            ...envelope,
            to: request.to,
            from: 10,
            d: { upTo: 20, events: [] },
        });
        expect((await guest.next("recoveryFrames")).d.upTo).toBe(20);
        await guest.barrier();
        expect(guest.messages.some((m) => ["down", "recoveryDone"].includes(m.t))).toBe(false);
        guest.send({ t: "recoveryAck", ...envelope, frame: 20, hash: 123 });
        await host.next("recoveryDone");
        await guest.next("recoveryDone");
        host.send({ t: "down", d: { from: 20, upTo: 21, events: [] } });
        expect((await guest.next("down")).d.upTo).toBe(21);
        host.send({ t: "end" });
        await host.next("recoveryOff");
        expect(readdirSync(directory)).not.toContain(`${h.recovery.runId}.json`);
    }, 15000);

    it("keeps legacy and mixed parties working without recovery", async () => {
        const { h, g, host, guest } = await party(true);
        expect(h.recovery).toBeUndefined();
        expect(g.recovery).toBeUndefined();
        guest.socket.close();
        await host.next("left");
        expect(readdirSync(directory).filter((f) => /^[a-f0-9]{32}\.json$/.test(f))).toEqual([]);
    });

    it("does not extend a recovery deadline across repeated process restarts", async () => {
        const { h } = await party();
        await kill();
        await start();
        const file = join(directory, `${h.recovery.runId}.json`);
        const first = JSON.parse(readFileSync(file, "utf8")).deadline;
        await kill();
        await start();
        expect(JSON.parse(readFileSync(file, "utf8")).deadline).toBe(first);
        await kill();
        const record = JSON.parse(readFileSync(file, "utf8"));
        writeFileSync(file, JSON.stringify({ ...record, deadline: Date.now() - 1 }));
        await start();
        await (await resume(h.recovery)).next("resumeRejected");
    });

    it("fails the party if state hashes disagree instead of resuming divergent games", async () => {
        const { h, g } = await party();
        await kill();
        await start();
        const host = await resume(h.recovery),
            guest = await resume(g.recovery);
        const sync = await host.next("recoverySync");
        await guest.next("recoverySync");
        const envelope = { runId: sync.runId, epoch: sync.epoch, frame: 9 };
        host.send({ t: "recoveryState", ...envelope, hash: 11 });
        guest.send({ t: "recoveryState", ...envelope, hash: 12 });
        expect((await host.next("gone")).reason).toBe("recoveryFailed");
        expect((await guest.next("gone")).reason).toBe("recoveryFailed");
    });

    it("revokes a kicked seat before another process can restore it", async () => {
        const { host, guest, h, g, room } = await party();
        host.send({ t: "kick", id: room.members[1].id });
        await guest.next("gone");
        await host.barrier();
        await kill();
        await start();
        await (await resume(g.recovery)).next("resumeRejected");
        const restored = await resume(h.recovery);
        expect((await restored.next("resumed")).room.members).toHaveLength(1);
    });
});

describe("recovery storage", () => {
    it.skipIf(process.platform !== "linux")(
        "reclaims a reused PID without reclaiming a live relay's lock",
        () => {
            const directory = mkdtempSync(join(tmpdir(), "coop-store-"));
            writeFileSync(
                join(directory, "server.lock"),
                JSON.stringify({ pid: process.pid, identity: "previous-boot:1" }),
            );
            const store = createRecoveryStore(directory);
            try {
                expect(() => createRecoveryStore(directory)).toThrow("Another relay");
            } finally {
                store.close();
                rmSync(directory, { recursive: true, force: true });
            }
        },
    );
    it("allows only one owner and releases its lock on close", () => {
        const directory = mkdtempSync(join(tmpdir(), "coop-store-"));
        const store = createRecoveryStore(directory);
        try {
            expect(() => createRecoveryStore(directory)).toThrow("Another relay");
        } finally {
            store.close();
        }
        createRecoveryStore(directory).close();
        rmSync(directory, { recursive: true, force: true });
    });
});
