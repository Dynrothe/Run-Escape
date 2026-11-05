# The Bell Choir: the Whisperer in the sunken cathedral

The fourth boss fight after Phosani's Nightmare and Justiciar Zachariah, and the first fought to a
beat. Dynny picked the pitch: _every attack lands on the bell's beat, and the tempo speeds up
each phase. Dodging on the beat gives a small buff. Skill: rhythm._ This is the design as built,
its numbers, and what's still to be found out in a playtest. The code's tour is in
`docs/DEVELOPMENT.md` (Boss fights as data, Songs).

## The idea

Under Ice Mountain the Zarosian city of Lassar sank, and its cathedral sits half-drowned in the
undercity's lake. The Silent Choir never stopped singing, and the Whisperer, the siren who drowned
the city, leads them. The player comes in as the Bellringer with one hand bell, and **the fight is
a song**: a beat clock runs all of it, every attack is counted in on that beat and lands on a beat
or on a counted half-beat, and the tempo steps up from 120 to 136 to 150 beats a minute. The
player hurts her only by keeping time:

- **Toll** the hand bell on the beat, near her: each on-beat Toll stacks **Resonance**.
- Spend it by **ringing back** one of the cathedral's four great bells in the two beats after she's
  struck it.
- **Step out of an attack on its last count** for a small buff (**Grace**).

| | Zachariah | The Bell Choir |
| --- | --- | --- |
| Clock | Cooldowns × phase tempo | A beat clock: everything counted in bars and beats |
| Offence | Auto strike in reach + Smite | Toll on the beat, ring back a bell, Grace for an on-beat dodge |
| Sound | Music under the fight | Music locked to the beat (it speeds up with her), bells as the metronome; fully playable muted |

## Where, and who

- **The arena** (`scaperune/maps/sunkenCathedral.ts`) is the real sunken cathedral, cut from map
  square 41,99. The real nave is too small for four great bells and the pews, so its broken walls
  are moved out from its middle by 1.3, and the octagon inside them is laid with the lake's water,
  walkable, with the cathedral's own animated water rings. Beyond the walls the lake is sealed.
- In it: the **tenor** (the Cloister Bell, 4×4) in the north doorway, keeping the beat; **four
  great bells** in the octagon's corners, tuned treble to tenor (NE, NW, SE, SW); **three rows of
  sunken pews** across the south half with a five-wide aisle up the middle and one down each side;
  the **choir**, three Lost Souls by each side wall; and a second Sunken Steeple in the lake behind
  the tenor. The bells and the choir are drawn by the fight, so they can lift, strike, bob and glow.
- **The Whisperer** (npc 12204), on her own skeleton: idle 10230, glide 10232, the clap 10254 (a
  raise and a clap 1.72 s in), a cast 10241, sinking 10247, rising 10227 (the Odd Figure's rise,
  which plays on her model too) and death 10260. **Her reflection** is the Odd Figure (12203), her
  head under the water.
- **The Bellringer** has no weapon: the crier bell and Virtus robes, 20% faster, 20% more
  hitpoints (30), heals 10 a minute.

## The beat

- **Tempo**, in whole ticks a beat (4 beats to the bar): 25 (120 bpm), 22 (136.4) and 20 (150).
  A new tempo only comes in on a downbeat. Half-beats are 13, 11 and 10 ticks.
- The clock starts with her entrance (6 s, 3 bars), so beat 0 is the music's first beat and the
  fight's first phrase is on bar 3's downbeat.
- **Phrases** begin on a downbeat: one of her voice's (Clap, Echo, Harmony) and one of the arena's
  (bells, Psalm, Silence) at once. Each lane rests some beats after its phrase (voice 4/2/1,
  arena 6/2/1 by phase; ×0.85 rounded down on hard) and begins again on the next downbeat. The
  first verse's bells come every four bars.
- **On the beat** is from 5 ticks before a beat to 7 after (−100 to +140 ms, late-leaning for
  phones and headphones). The first press in a window counts; a second is let go. In co-op a
  guest's press carries the tick they pressed it on (`at`), at most 15 ticks back.
- **Grace**: in an attack's area as its last beat began, and not hit as it lands. Once a phrase.

### Seeing and hearing it

- A ripple runs out from the tenor on every beat (the Whisperer's own ripple, 2453), wider on the
  downbeat; the tenor flashes as it's struck; the choir dips on every beat and glows while it
  sings; her idle sways one loop a bar; the nave brightens 5% on each downbeat and eases back.
- Every warning on the ground fills a step a beat: a quarter, a half, three quarters, then the hit.
  Her reflection's are violet.
- With the game's sound muted, a faint ring runs out at the player's feet on each beat.
- The tenor, the bells' notes and each part's landing are started on the audio clock as the
  picture shows them, less the output latency the browser reports. The music (Song of the Silent
  Choir, exactly 120 bpm from its first sample) plays at the tempo's rate with its pitch held, kept
  on the beat (nudged up to 3%, jumping past 250 ms), and ducks for Silence's rest and a key
  change's quiet bar.

## Fighting back

| | Number |
| --- | --- |
| Toll on the beat within 4.5 of her middle | 6 + 2 × Resonance, then +1 Resonance (max 8): 6 to 22 a beat |
| On the beat, out of reach | rings, nothing else |
| Off the beat | Resonance halves |
| Hit | −2 Resonance |
| Ring back (Toll within 4.5 + radius of a bell's middle, the 2 beats after it's struck) | 40 + 15 × Resonance (40 to 160), Resonance to 0 |
| Discord (out of tune) | double damage for a bar, once a round of the bells |
| Grace | +2 Resonance, Toll's reach 6.5 for a bar |

## Her attacks

| Attack | Phases | Damage | Lands | Warning (ticks P1/P2/P3) | To be clear |
| --- | --- | --- | --- | --- | --- |
| The Clap: r 3.5 round her | 1, 2 | 7 | beat 4 | 75 / 66 / – | 2.0 tiles from her edge |
| Double clap: + ring 3.5–5.5 | 3 | 7 + 5 | beat 4, and its "and" | 60 (+10) | 0.7 back in, or beyond 5.85 |
| Echo: r 1 mark where you stood, each beat of a bar | 1 | 4 each | a bar later | 100 | 1.35 tiles |
| Echo (syncopated) | 2, 3 | 4 each | a bar and a half beat later | 88 / 80 (+½) | 1.35 tiles |
| Change ringing: r 4.5 round each bell | 1 (in order), 2 (shuffled), 3 (in pairs) | 6 | a bar after its lift | 100 / 88 / 80 | 2.5 tiles from the bell |
| The Psalm: a band a beat, north to south | 2 (3 from both ends) | 6 | 3 ticks a band | 44 / 40 | 0.7 back across |
| Silence: moving > 0.15 in the rest | 2, 3 | 8 | beat 4 + 4 ticks to the next beat | 66 / 60 | stop |
| Harmony: a strip 1.5 wide between two of the choir | 2 (3: two lines) | 7 | the next downbeat | 88 / 80 | 1.1 tiles |
| Canon: her voice's phrases again a bar later, mirrored about the nave's axis | 3 | | | | |

The Psalm's bands are the nave's 35 rows in nine (3 or 4 rows each), with nothing between them.

## Phases

4,500 hitpoints, each phase its own full bar: the first verse to 74% (120 bpm), the tempo
quickens to 37% (136, opener the Psalm), and the Requiem (150, opener the bells in pairs, with the
canon). **A threshold is a key change**: she sinks, the rest of the bar (and the next, if less
than half's left) stays at the old tempo with the music ducked and the tenor quiet, the tenor
counts in a bar at the new one while she rises, and she's up on the downbeat with the gong.
Hard mode is `hard: { hp: 1.3, damage: 1.3 }` and the lanes' rests ×0.85; the tempo isn't raised.

## Rewards

The Wisp (npc 12157, the follower), 1 in 10 for killing her, certain on hard; the quest The Silent
Choir (4,500 coins). It opens once Justiciar Zachariah's beaten.

## Bot numbers (simulate-run.ts, 3 seeds; the bot keeps perfect time unless sloppy)

| | Phase 1 | Phase 2 | Phase 3 | Result |
| --- | --- | --- | --- | --- |
| Careful, normal | 31–32 s | 35–42 s | 35–37 s | 3/3 won, 1:40–1:46 |
| Sloppy, normal (±150 ms, 1 beat in 6 missed, slower) | 40–56 s | 58–64 s | 29–57 s | 2/3 won, 2:32–2:51 |
| Careful, hard | 37–38 s | 45–51 s | 29–49 s | 1/3 won, 2:09 |
| Sloppy, hard | 49–64 s | 67–76 s | died | 0/3 |
| Party of 2 (guests' presses 6 ticks late) | | | | 1/3 on the map, 3/3 on `FLAT=1`, about 1:55 |
| Party of 4 | | | | 0/3: reaches the Requiem in about 80 s |

The bot can't read the room as a person does; most of what hits it is the Psalm from both ends
and the double clap. The careful bot is on every beat in reach: a good player will be about a
third slower.

## What a playtest has to settle

- **The window's feel**: 13 ticks, late-leaning. Does a press that feels on the beat count?
- **Phone latency**: the beat lab (`?beatlab`) measures it. Headless Chrome reported 32 ms of
  output latency, held the pitch, kept the music within 4–19 ms on average (up to about 50 ms as
  the tempo changes) and started no beat late. iOS Safari and Android Chrome are unmeasured.
- **Tolling every beat**: fun or tiring on a phone? The lever is half-time (beats 1 and 3, damage
  doubled).
- Co-op: four players' echoes are four times the marks.
