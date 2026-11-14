// Dev only: turns a trailer the game records (client/TrailerRecorder.ts) into an MP4 with ffmpeg,
// at /__trailer on the dev server. The game sends its frames one request at a time as raw RGBA,
// piped straight into ffmpeg, and its sound as a WAV once the frames are done.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { normalizePath } from "vite";
import type { Plugin } from "vite";

export const TRAILERS_DIR = resolve(process.cwd(), "trailers");
const TRAILERS_PATH = normalizePath(TRAILERS_DIR);

// Kept out of Vite's file watcher: a trailer's frames are gigabytes on their way through
export function isTrailerFile(file: string): boolean {
    const path = normalizePath(file);
    return path === TRAILERS_PATH || path.startsWith(`${TRAILERS_PATH}/`);
}

// FFMPEG for one that isn't on the PATH
function ffmpegPath(): string {
    return process.env.FFMPEG || "ffmpeg";
}

export type TrailerSpec = { name: string; width: number; height: number; fps: number };

// Letters, digits, - and _ only: it's a file name in trailers/
export function trailerName(name: string | null | undefined): string {
    const clean = (name ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return clean.slice(0, 80) || "trailer";
}

export function readSpec(query: URLSearchParams): TrailerSpec | string {
    const width = Number(query.get("width"));
    const height = Number(query.get("height"));
    const fps = Number(query.get("fps"));
    // H.264 in 4:2:0 wants even sides
    if (!Number.isInteger(width) || width < 2 || width > 7680 || width % 2 !== 0) {
        return "width must be an even number of pixels, up to 7680";
    }
    if (!Number.isInteger(height) || height < 2 || height > 4320 || height % 2 !== 0) {
        return "height must be an even number of pixels, up to 4320";
    }
    if (!Number.isInteger(fps) || fps < 1 || fps > 240) {
        return "fps must be a whole number from 1 to 240";
    }
    return { name: trailerName(query.get("name")), width, height, fps };
}

// The frames in, as raw RGBA, to H.264. Tagged BT.709, so players see the colours the game drew.
export function videoArgs(spec: TrailerSpec, out: string): string[] {
    return [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-s",
        `${spec.width}x${spec.height}`,
        "-framerate",
        String(spec.fps),
        "-i",
        "pipe:0",
        "-vf",
        "scale=out_color_matrix=bt709:out_range=tv",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "16",
        "-pix_fmt",
        "yuv420p",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-movflags",
        "+faststart",
        out,
    ];
}

// The video with its sound, the video copied as it is. The sound's brought up to the loudness
// video sites play at (the game's own levels are quiet beside other videos).
export function muxArgs(video: string, wav: string, out: string): string[] {
    return [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        video,
        "-i",
        wav,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-ar",
        "48000",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        out,
    ];
}

type Job = {
    spec: TrailerSpec;
    ffmpeg: ChildProcess;
    video: string;
    frames: number;
    // The end of what ffmpeg's said, for when it fails
    log: string;
    exit: Promise<number | null>;
};

function keepLog(job: Job, chunk: Buffer): void {
    job.log = (job.log + chunk.toString()).slice(-4000);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

function reply(res: ServerResponse, status: number, body: object): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
}

function remove(file: string): void {
    try {
        rmSync(file, { force: true });
    } catch (error) {
        console.warn(`Couldn't delete ${file}`, error);
    }
}

function run(args: string[]): Promise<{ code: number | null; log: string }> {
    return new Promise((done) => {
        const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
        let log = "";
        child.stderr.on("data", (chunk: Buffer) => (log = (log + chunk.toString()).slice(-4000)));
        child.on("error", (error) => done({ code: -1, log: String(error) }));
        child.on("close", (code) => done({ code, log }));
    });
}

export function trailerServerPlugin(): Plugin {
    let job: Job | undefined;

    // Its half-made video's deleted once ffmpeg's gone: Windows won't delete a file still open
    const stop = () => {
        const current = job;
        job = undefined;
        if (current) {
            current.ffmpeg.kill("SIGKILL");
            void current.exit.then(() => remove(current.video));
        }
    };

    const start = (query: URLSearchParams, res: ServerResponse) => {
        const spec = readSpec(query);
        if (typeof spec === "string") {
            return reply(res, 400, { error: spec });
        }
        const check = spawnSync(ffmpegPath(), ["-version"], { stdio: "ignore" });
        if (check.error || check.status !== 0) {
            return reply(res, 500, {
                error: "ffmpeg wasn't found: install it, or set FFMPEG to its path and restart",
            });
        }
        stop();
        mkdirSync(TRAILERS_DIR, { recursive: true });
        const video = join(TRAILERS_DIR, `${spec.name}.video.mp4`);
        const ffmpeg = spawn(ffmpegPath(), videoArgs(spec, video), {
            stdio: ["pipe", "ignore", "pipe"],
        });
        const exit = new Promise<number | null>((done) => {
            ffmpeg.on("error", () => done(-1));
            ffmpeg.on("close", done);
        });
        const started: Job = { spec, ffmpeg, video, frames: 0, log: "", exit };
        ffmpeg.stderr!.on("data", (chunk: Buffer) => keepLog(started, chunk));
        // A broken pipe is ffmpeg gone, which its exit code tells
        ffmpeg.stdin!.on("error", () => {});
        job = started;
        reply(res, 200, { file: join(TRAILERS_DIR, `${spec.name}.mp4`) });
    };

    const frame = async (req: IncomingMessage, res: ServerResponse) => {
        const body = await readBody(req);
        const current = job;
        if (!current) {
            return reply(res, 409, { error: "No trailer's being recorded" });
        }
        const { width, height } = current.spec;
        if (body.length !== width * height * 4) {
            return reply(res, 400, {
                error: `A frame is ${width * height * 4} bytes, not ${body.length}`,
            });
        }
        if (current.ffmpeg.exitCode !== null) {
            const log = current.log.trim();
            stop();
            return reply(res, 500, { error: `ffmpeg stopped: ${log}` });
        }
        const stdin = current.ffmpeg.stdin!;
        // Answered once ffmpeg's taken it, so the game never gets far ahead of the encoder
        if (!stdin.write(body)) {
            await Promise.race([once(stdin, "drain"), current.exit]);
        }
        current.frames++;
        res.statusCode = 204;
        res.end();
    };

    const finish = async (req: IncomingMessage, res: ServerResponse) => {
        const wav = await readBody(req);
        const current = job;
        if (!current) {
            return reply(res, 409, { error: "No trailer's being recorded" });
        }
        job = undefined;
        current.ffmpeg.stdin!.end();
        const code = await current.exit;
        if (code !== 0 || current.frames === 0) {
            remove(current.video);
            return reply(res, 500, {
                error: `ffmpeg failed (${code}): ${current.log.trim() || "no frames"}`,
            });
        }
        const out = join(TRAILERS_DIR, `${current.spec.name}.mp4`);
        if (wav.length === 0) {
            renameSync(current.video, out);
            return reply(res, 200, { file: out, frames: current.frames });
        }
        const wavFile = join(TRAILERS_DIR, `${current.spec.name}.wav`);
        writeFileSync(wavFile, wav);
        const muxed = await run(muxArgs(current.video, wavFile, out));
        remove(wavFile);
        if (muxed.code !== 0) {
            return reply(res, 500, {
                error: `ffmpeg couldn't add the sound (${muxed.code}): ${muxed.log.trim()}`,
                video: current.video,
            });
        }
        remove(current.video);
        reply(res, 200, { file: out, frames: current.frames });
    };

    return {
        name: "trailer-server",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use("/__trailer", (req, res, next) => {
                const url = new URL(req.url ?? "/", "http://localhost");
                if (req.method !== "POST") {
                    return next();
                }
                const handle = async () => {
                    switch (url.pathname) {
                        case "/start":
                            return start(url.searchParams, res);
                        case "/frame":
                            return frame(req, res);
                        case "/finish":
                            return finish(req, res);
                        case "/cancel":
                            stop();
                            res.statusCode = 204;
                            return res.end();
                        default:
                            return next();
                    }
                };
                handle().catch((error) => {
                    if (!res.headersSent) {
                        reply(res, 500, { error: String(error) });
                    }
                });
            });
            server.httpServer?.on("close", stop);
        },
    };
}
