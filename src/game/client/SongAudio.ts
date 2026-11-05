import { TICKS_PER_SECOND } from "../core/Sim";
import type { Sim } from "../core/Sim";
import { shapeMiddle } from "../core/song";
import { MusicSync, TRACK_BEAT_SECONDS, whenForTick } from "./BeatAudio";
import { GameAudio } from "./GameAudio";

// A song's sound (BossDef.song, the Bell Choir): what lands on the beat started on the audio
// clock as the picture shows it (the tenor on each downbeat, each phrase's part as it lands, each
// great bell's note), and the music kept on the beat at the tempo's speed, ducked for a rest. The
// sim never hears any of it: muted, the fight's the same.

// How far ahead what's on a beat is started, in ticks (a pause can't strand more than this)
const LOOKAHEAD_TICKS = 3;
// How quiet the music goes for Silence's rest, and a key change's quiet bar, and how fast it gets
// there (per second)
const REST_DUCK = 0.2;
const QUIET_DUCK = 0.3;
const DUCK_SPEED = 8;
// The tenor's toll, quieter than what's dangerous
const TENOR_VOLUME = 0.45;

export class SongAudio {
    private readonly sync = new MusicSync();
    // What's been started already: the last beat, and parts by id
    private scheduledBeat = -1;
    private readonly scheduledNotes = new Set<number>();
    private duck = 1;
    private songStart = -1;

    constructor(private readonly audio: GameAudio) {}

    // Each frame: shownTick is the tick on the screen now (fractional), listener where the camera
    // hears from
    update(sim: Sim, shownTick: number, listener: { x: number; y: number }, deltaMs: number): void {
        const song = sim.song;
        const def = song && sim.shownBoss?.def.boss?.song;
        const audio = this.audio;
        if (!song) {
            if (this.duck !== 1) {
                this.duck = 1;
                audio.setMusicDuck(1);
            }
            return;
        }
        if (song.startTick !== this.songStart) {
            // A new run (a Retry): start again
            this.songStart = song.startTick;
            this.scheduledBeat = -1;
            this.scheduledNotes.clear();
        }
        const latency = audio.outputLatency;
        const tpb = song.ticksPerBeat;
        // The music where the beat is, as it'll be heard
        const heardTick = shownTick + latency * TICKS_PER_SECOND;
        const beats = song.beat + (heardTick - song.beatTick) / tpb;
        this.sync.update(
            audio.musicElement,
            Math.max(0, beats),
            (TICKS_PER_SECOND * TRACK_BEAT_SECONDS) / tpb,
        );
        const phase = sim.shownBoss?.bossState?.phase;
        const quiet = phase?.pauseEnd !== undefined && shownTick < (phase.riseTick ?? Infinity);
        const rest = song.rest;
        const resting = rest !== undefined && shownTick >= rest.fromTick - (def?.early ?? 0) - 1;
        const target = resting ? REST_DUCK : quiet ? QUIET_DUCK : 1;
        const step = Math.min(1, (deltaMs / 1000) * DUCK_SPEED);
        const duck = this.duck + (target - this.duck) * step;
        if (Math.abs(duck - this.duck) > 0.005 || (target === 1 && this.duck !== 1)) {
            this.duck = Math.abs(target - duck) < 0.01 ? target : duck;
            audio.setMusicDuck(this.duck);
        }
        const clock = audio.clock;
        if (clock === undefined || !def) {
            return;
        }
        const at = (tick: number) => whenForTick(tick, shownTick, clock, latency, TICKS_PER_SECOND);
        // The tenor on the next downbeat, but not in a rest or the quiet bar
        const next = song.beat + 1;
        if (song.nextTick - shownTick <= LOOKAHEAD_TICKS && next > this.scheduledBeat) {
            this.scheduledBeat = next;
            const downbeat = next - song.barBeat >= 4;
            const silent =
                (rest !== undefined && song.nextTick >= rest.fromTick - def.early) ||
                (phase?.pauseEnd !== undefined && song.nextTick < (phase.riseTick ?? 0));
            const tenor = sim.map.features?.tenor;
            if (downbeat && !silent && def.tenorSound !== undefined && tenor) {
                const x = tenor.x + (tenor.size ?? 1) / 2;
                const y = tenor.y + (tenor.size ?? 1) / 2;
                audio.playAt(def.tenorSound, x, y, listener.x, listener.y, {
                    volume: TENOR_VOLUME,
                    when: at(song.nextTick),
                    minGap: 0,
                });
            }
        }
        // Each part as it lands: its own sound, or a bell's note
        for (const note of song.notes) {
            if (
                this.scheduledNotes.has(note.id) ||
                note.landTick - shownTick > LOOKAHEAD_TICKS ||
                note.landTick < shownTick - 1
            ) {
                continue;
            }
            this.scheduledNotes.add(note.id);
            const sound =
                note.bell !== undefined ? def.bellSounds?.[note.bell] : (note.sound ?? undefined);
            if (sound === undefined) {
                continue;
            }
            const { x, y } = shapeMiddle(note.shape);
            audio.playAt(sound, x, y, listener.x, listener.y, {
                volume: note.canon ? 0.55 : 0.85,
                when: at(note.landTick),
                minGap: 0,
            });
        }
        if (this.scheduledNotes.size > 400) {
            const live = new Set(song.notes.map((note) => note.id));
            for (const id of this.scheduledNotes) {
                if (!live.has(id)) {
                    this.scheduledNotes.delete(id);
                }
            }
        }
    }
}
