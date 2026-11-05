import { useEffect, useRef, useState } from "react";

import music from "../../media/music/song_of_the_silent_choir.ogg";
import { MusicSync, TRACK_BEAT_SECONDS, whenForTick } from "../client/BeatAudio";
import { TICKS_PER_SECOND } from "../core/Sim";

// The Bell Choir's audio, on its own (?beatlab): the beat as the fight schedules it, the music at
// its three tempos kept on the beat, and a tap test. For checking a browser and a phone before the
// fight's played on it: how late it reports its sound is, whether the pitch holds when the music's
// sped up, how far the music drifts, and how late a player taps to what they hear.

// Ticks a beat at each of the fight's tempos (BossDef.song), as the sim has them
const TEMPOS = [25, 22, 20];
// How far ahead beats are started on the audio clock, as the game does (in ticks)
const LOOKAHEAD = 3;
// The fight's window for a press on the beat, in ticks either side (its late side is longer)
const EARLY = 5;
const LATE = 7;
const TICK_MS = 1000 / TICKS_PER_SECOND;

type Stats = {
    latency: string;
    pitch: string;
    drift: string;
    jumps: number;
    late: number;
    scheduled: number;
    taps: string;
    tempo: number;
};

function describeTaps(offsets: number[]): string {
    if (offsets.length === 0) {
        return "none yet";
    }
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const spread = Math.sqrt(
        offsets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / offsets.length,
    );
    const inWindow = offsets.filter((o) => o >= -EARLY * TICK_MS && o <= LATE * TICK_MS).length;
    return (
        `${offsets.length} taps, ${mean >= 0 ? "+" : ""}${mean.toFixed(0)} ms on average ` +
        `(± ${spread.toFixed(0)}), ${Math.round((inWindow / offsets.length) * 100)}% in the window`
    );
}

export function BeatLab() {
    const [running, setRunning] = useState(false);
    const [stats, setStats] = useState<Stats>();
    const [musicOn, setMusicOn] = useState(true);
    const [clickOn, setClickOn] = useState(true);
    const lab = useRef<
        | {
              context: AudioContext;
              element: HTMLAudioElement;
              sync: MusicSync;
              tempo: number;
              // The sim's clock as the game steps it: ticks, the last beat and when it was
              tick: number;
              beat: number;
              beatTick: number;
              start: number;
              lastFrame: number;
              accumulator: number;
              scheduledBeat: number;
              drifts: number[];
              late: number;
              scheduled: number;
              taps: number[];
              auto: boolean;
              frame: number;
          }
        | undefined
    >(undefined);
    const musicOnRef = useRef(musicOn);
    const clickOnRef = useRef(clickOn);
    musicOnRef.current = musicOn;
    clickOnRef.current = clickOn;

    const start = () => {
        if (lab.current) {
            return;
        }
        const context = new AudioContext();
        const element = new Audio(music);
        element.loop = true;
        element.volume = 0.7;
        const now = performance.now();
        lab.current = {
            context,
            element,
            sync: new MusicSync(),
            tempo: 0,
            tick: 0,
            beat: 0,
            beatTick: 0,
            start: now,
            lastFrame: now,
            accumulator: 0,
            scheduledBeat: -1,
            drifts: [],
            late: 0,
            scheduled: 0,
            taps: [],
            auto: true,
            frame: 0,
        };
        element.play().catch(() => {});
        setRunning(true);
        const step = (time: number) => {
            const l = lab.current;
            if (!l) {
                return;
            }
            l.accumulator += Math.min(time - l.lastFrame, 100);
            l.lastFrame = time;
            const tpb = () => TEMPOS[l.tempo];
            while (l.accumulator >= TICK_MS) {
                l.accumulator -= TICK_MS;
                l.tick++;
                if (l.tick - l.beatTick >= tpb()) {
                    l.beat++;
                    l.beatTick = l.tick;
                    // Every eight bars the tempo goes up a step, and round again
                    if (l.auto && l.beat % 32 === 0) {
                        l.tempo = (l.tempo + 1) % TEMPOS.length;
                    }
                }
            }
            const shown = l.tick + l.accumulator / TICK_MS;
            const latency =
                (l.context as AudioContext & { outputLatency?: number }).outputLatency ||
                l.context.baseLatency ||
                0;
            // The next beat, started on the audio clock a few ticks before it's shown
            const nextTick = l.beatTick + tpb();
            if (nextTick - shown <= LOOKAHEAD && l.scheduledBeat < l.beat + 1) {
                l.scheduledBeat = l.beat + 1;
                const when = whenForTick(
                    nextTick,
                    shown,
                    l.context.currentTime,
                    latency,
                    TICKS_PER_SECOND,
                );
                l.scheduled++;
                if (when < l.context.currentTime) {
                    l.late++;
                }
                if (clickOnRef.current) {
                    playBell(l.context, when, (l.beat + 1) % 4 === 0);
                }
            }
            // The music where the beat is, as it'll be heard
            const beats =
                l.beat + (shown - l.beatTick) / tpb() + (latency * TICKS_PER_SECOND) / tpb();
            l.element.muted = !musicOnRef.current;
            l.sync.update(l.element, beats, (TICKS_PER_SECOND * TRACK_BEAT_SECONDS) / tpb());
            if (!l.element.paused) {
                l.drifts.push(l.sync.drift * 1000);
                if (l.drifts.length > 600) {
                    l.drifts.shift();
                }
            }
            if (l.frame++ % 15 === 0) {
                const abs = l.drifts.map(Math.abs);
                const meanDrift = abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length);
                setStats({
                    latency:
                        `output ${(latency * 1000).toFixed(0)} ms ` +
                        `(outputLatency ${describe((l.context as any).outputLatency)}, ` +
                        `baseLatency ${describe(l.context.baseLatency)})`,
                    pitch: l.sync.pitchHeld ? "held (preservesPitch)" : "not held: it rises",
                    drift:
                        `${meanDrift.toFixed(0)} ms on average, ` +
                        `${Math.max(0, ...abs).toFixed(0)} ms at most (last ${abs.length} frames)`,
                    jumps: l.sync.jumps,
                    late: l.late,
                    scheduled: l.scheduled,
                    taps: describeTaps(l.taps),
                    tempo: Math.round((60 * TICKS_PER_SECOND) / tpb()),
                });
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    // A tap, judged as the fight judges a press: the nearest beat's tick, in ms from it
    const tap = () => {
        const l = lab.current;
        if (!l) {
            return;
        }
        const shown = l.tick + l.accumulator / TICK_MS;
        const tpb = TEMPOS[l.tempo];
        const fromLast = shown - l.beatTick;
        const offset = fromLast <= tpb / 2 ? fromLast : fromLast - tpb;
        l.taps.push(offset * TICK_MS);
        if (l.taps.length > 40) {
            l.taps.shift();
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                e.preventDefault();
                tap();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            const l = lab.current;
            l?.element.pause();
            l?.context.close();
            lab.current = undefined;
        };
    }, []);

    const setTempo = (index: number) => {
        if (lab.current) {
            lab.current.auto = false;
            lab.current.tempo = index;
        }
    };

    const summary = stats
        ? [
              `Browser: ${navigator.userAgent}`,
              `Latency: ${stats.latency}`,
              `Pitch: ${stats.pitch}`,
              `Music drift: ${stats.drift}, ${stats.jumps} jumps`,
              `Beats started late: ${stats.late} of ${stats.scheduled}`,
              `Taps: ${stats.taps}`,
          ].join("\n")
        : "";

    return (
        <div style={{ padding: 16, color: "#dde", background: "#101225", minHeight: "100vh" }}>
            <h2>The Bell Choir: beat lab</h2>
            <p>
                Press Start, then tap the big button (or Space) on every bell you hear. The last
                bell of each bar is the higher one. The tempo steps up every eight bars (120, 136,
                150 a minute), or pick one.
            </p>
            {!running ? (
                <button onClick={start} style={{ fontSize: 24, padding: "12px 24px" }}>
                    Start
                </button>
            ) : (
                <>
                    <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                        {TEMPOS.map((tpb, i) => (
                            <button key={tpb} onClick={() => setTempo(i)}>
                                {Math.round((60 * TICKS_PER_SECOND) / tpb)} bpm
                            </button>
                        ))}
                        <label>
                            <input
                                type="checkbox"
                                checked={musicOn}
                                onChange={(e) => setMusicOn(e.target.checked)}
                            />
                            Music
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={clickOn}
                                onChange={(e) => setClickOn(e.target.checked)}
                            />
                            Bells
                        </label>
                    </div>
                    <button
                        onPointerDown={tap}
                        style={{
                            width: "100%",
                            height: 160,
                            fontSize: 32,
                            touchAction: "manipulation",
                        }}
                    >
                        Tap on the beat ({stats?.tempo ?? 120} bpm)
                    </button>
                    <pre style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>{summary}</pre>
                </>
            )}
        </div>
    );
}

function describe(value: unknown): string {
    return typeof value === "number" ? `${(value * 1000).toFixed(1)} ms` : "not reported";
}

// A short bell: two partials, struck and fading, higher on a bar's last beat
function playBell(context: AudioContext, when: number, high: boolean): void {
    const gain = context.createGain();
    gain.connect(context.destination);
    const at = Math.max(when, context.currentTime);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    for (const ratio of [1, 2.76]) {
        const osc = context.createOscillator();
        osc.frequency.value = (high ? 1320 : 880) * ratio;
        osc.connect(gain);
        osc.start(at);
        osc.stop(at + 0.45);
    }
}

export default BeatLab;
