// What a boss's shapes ask of the player, read off the sim as a person reads them, for both balance
// bots (simulate-run.ts's fights and tombsBot.ts's raid): a wall's gap, a closing ring's gap, orbs
// and aimed shots to step across, a tether's side, a pool or a blast to step out of, a lunge's
// strip to step off sideways (not back down it), the pocket between two strips, a long wedge to
// step out of sideways, a surge's lane, marks about to land, a sandstorm's shelter, and the boss
// whose guard is down for the fight's button. Each says which way to go (a unit step, or none to
// stand), or undefined when it has nothing to say. Nothing here touches the DOM or Node, so the
// dev console can use it too, as it does tombsBot.
import { type Sim, TICKS_PER_SECOND } from "../../src/game/core/Sim";
import { BossWindup, Enemy } from "../../src/game/core/entities";

type Point = { x: number; y: number };
// A wall of a boss's bullets (BulletPatternDef shape "wall") coming at it: across to the nearest
// spot in line with the way through (or past its end), as a person walks to the gap. Undefined
// when there's none coming, or it's in line with a way through already.
export function wallGap(
    sim: Sim,
    room: (x: number, y: number) => boolean = inSquare(sim),
): { x: number; y: number } | undefined {
    const player = sim.player;
    const { bullets } = sim;
    // The nearest rank on its way: its heading, and how far off it is
    let dirX = 0;
    let dirY = 0;
    let ahead = Infinity;
    const isWall = (slot: number) =>
        sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape === "wall";
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (!isWall(slot)) {
            continue;
        }
        const speed = Math.hypot(bullets.vx[slot], bullets.vy[slot]);
        if (speed < 1e-6) {
            continue;
        }
        const ux = bullets.vx[slot] / speed;
        const uy = bullets.vy[slot] / speed;
        const along = (player.x - bullets.x[slot]) * ux + (player.y - bullets.y[slot]) * uy;
        if (along > -1 && along < 5 && along < ahead) {
            ahead = along;
            dirX = ux;
            dirY = uy;
        }
    }
    if (ahead === Infinity) {
        return undefined;
    }
    // Where along the rank its guards are, across the way it's going
    const blocked: { at: number; radius: number }[] = [];
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (!isWall(slot)) {
            continue;
        }
        const dx = player.x - bullets.x[slot];
        const dy = player.y - bullets.y[slot];
        const along = dx * dirX + dy * dirY;
        const speed = Math.hypot(bullets.vx[slot], bullets.vy[slot]);
        const same = (bullets.vx[slot] * dirX + bullets.vy[slot] * dirY) / speed > 0.99;
        if (same && Math.abs(along - ahead) < 0.8) {
            blocked.push({ at: -(dx * -dirY + dy * dirX), radius: bullets.radius[slot] });
        }
    }
    const clear = (at: number) =>
        blocked.every((b) => Math.abs(b.at - at) > b.radius + player.radius + 0.25);
    if (clear(0)) {
        // In line with the way through: on through it, before anything else moves it off
        return ahead < 2 ? { x: -dirX, y: -dirY } : undefined;
    }
    const inside = (at: number) => room(player.x - dirY * at, player.y + dirX * at);
    for (let step = 1; step <= 120; step++) {
        for (const at of [step * 0.1, -step * 0.1]) {
            if (clear(at) && inside(at)) {
                const side = at > 0 ? 1 : -1;
                // Across, and back from it a little if it's close
                const back = ahead < 1.5 ? 0.5 : 0;
                const x = -dirY * side - dirX * back;
                const y = dirX * side - dirY * back;
                const length = Math.hypot(x, y);
                return { x: x / length, y: y / length };
            }
        }
    }
    return undefined;
}

// A closing ring of a boss's bullets round it (BulletPatternDef shape "closing"): towards the
// widest way between them, while it's inside. Undefined when there's none, or it's out.
export function cageGap(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    const { bullets } = sim;
    const angles: number[] = [];
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape !== "closing") {
            continue;
        }
        angles.push(Math.atan2(bullets.y[slot] - player.y, bullets.x[slot] - player.x));
    }
    if (angles.length < 3) {
        return undefined;
    }
    angles.sort((a, b) => a - b);
    let widest = 0;
    let at = 0;
    angles.forEach((angle, i) => {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
        if (next - angle > widest) {
            widest = next - angle;
            at = angle + (next - angle) / 2;
        }
    });
    // Over half the way round empty: it's out already
    if (widest > Math.PI) {
        return undefined;
    }
    return { x: Math.cos(at), y: Math.sin(at) };
}

// Orbs that follow it (a boss's projectiles with homing): across the way the nearest is going,
// once it's close, as a sharp turn beats one that turns slowly
export function dodgeOrbs(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    let nearest: (typeof sim.enemyProjectiles)[number] | undefined;
    let away = 2.5;
    for (const projectile of sim.enemyProjectiles) {
        if (projectile.homing <= 0 || projectile.hit) {
            continue;
        }
        const distance = Math.hypot(player.x - projectile.x, player.y - projectile.y);
        if (distance < away) {
            away = distance;
            nearest = projectile;
        }
    }
    if (!nearest) {
        return undefined;
    }
    const speed = Math.max(0.001, Math.hypot(nearest.vx, nearest.vy));
    const dx = player.x - nearest.x;
    const dy = player.y - nearest.y;
    const side = dx * nearest.vy - dy * nearest.vx >= 0 ? 1 : -1;
    // Across it, and away from it a little
    return openWay(
        sim,
        (nearest.vy / speed) * side * 0.8 + (dx / Math.max(away, 0.001)) * 0.6,
        (-nearest.vx / speed) * side * 0.8 + (dy / Math.max(away, 0.001)) * 0.6,
    );
}

// Off a boss's tether (BossAttackDef.tether), once it's about to hurt: straight out from the
// beam, on the side it's on, as a person keeps their side of it
export function offTether(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const tether of sim.tethers) {
        const ends = sim.tetherEnds(tether);
        if (!ends || sim.tick < tether.armTick - TICKS_PER_SECOND / 2) {
            continue;
        }
        const { boss, partner } = ends;
        const dx = partner.x - boss.x;
        const dy = partner.y - boss.y;
        const lengthSq = Math.max(0.001, dx * dx + dy * dy);
        const t = Math.max(
            0,
            Math.min(1, ((player.x - boss.x) * dx + (player.y - boss.y) * dy) / lengthSq),
        );
        const ox = player.x - (boss.x + dx * t);
        const oy = player.y - (boss.y + dy * t);
        const away = Math.hypot(ox, oy);
        if (away < tether.attack.tether!.width / 2 + player.radius + 0.7) {
            return away > 0.001 ? openWay(sim, ox / away, oy / away) : openWay(sim, -dy, dx);
        }
    }
    return undefined;
}

// Across a boss's aimed shot that's coming straight at it (not a homing one: dodgeOrbs), once
// it's close, as a person steps off a bolt's line
export function dodgeShots(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const projectile of sim.enemyProjectiles) {
        if (projectile.homing > 0 || projectile.hit) {
            continue;
        }
        const speed = Math.max(0.001, Math.hypot(projectile.vx, projectile.vy));
        const ux = projectile.vx / speed;
        const uy = projectile.vy / speed;
        const dx = player.x - projectile.x;
        const dy = player.y - projectile.y;
        const along = dx * ux + dy * uy;
        const side = dx * -uy + dy * ux;
        if (along > 0 && along < 3.5 && Math.abs(side) < projectile.radius + player.radius + 0.3) {
            const sign = side >= 0 ? 1 : -1;
            return openWay(sim, -uy * sign, ux * sign);
        }
    }
    return undefined;
}

// Out of a boss's pool (BossAttackDef.pool: the elder's sinking sand), the short way
export function outOfPool(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const pool of sim.pools) {
        const dx = player.x - pool.x;
        const dy = player.y - pool.y;
        const away = Math.hypot(dx, dy);
        if (pool.endTick > sim.tick && away < pool.radius + player.radius + 0.2) {
            return away > 0.001 ? openWay(sim, dx / away, dy / away) : { x: 1, y: 0 };
        }
    }
    return undefined;
}

// Off where another boss's blast will land than the one on the bar (two at once: the Scarab
// Mages), as fightMove does for that one's
export function otherBlasts(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const enemy of sim.enemies) {
        const windup = enemy.bossState?.windup;
        if (enemy.dead || enemy === sim.shownBoss || windup?.attack.kind !== "blast") {
            continue;
        }
        const reach = (windup.attack.radius ?? 1) + player.radius + 0.5;
        for (const spot of windup.targets) {
            const dx = player.x - spot.x;
            const dy = player.y - spot.y;
            const away = Math.hypot(dx, dy);
            if (away < reach) {
                return away > 0.001 ? { x: dx / away, y: dy / away } : { x: 1, y: 0 };
            }
        }
    }
    return undefined;
}

// Sidesteps what's about to reach it, the nearer the more. A person reads
// the arms of a spiral far sooner than this does. A wall's left to wallGap.
export function sidestepBullets(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    let awayX = 0;
    let awayY = 0;
    const { bullets } = sim;
    for (let i = 0; i < bullets.count; i++) {
        const slot = bullets.order[i];
        if (sim.bulletSources[bullets.source[slot]]?.attack.pattern?.shape === "wall") {
            continue;
        }
        const dx = player.x - bullets.x[slot];
        const dy = player.y - bullets.y[slot];
        const distSq = dx * dx + dy * dy;
        // Only those coming this way
        if (distSq < 9 && dx * bullets.vx[slot] + dy * bullets.vy[slot] > 0) {
            const weight = 1 / Math.max(distSq, 0.1);
            // Across its path, to whichever side it's already nearer
            const side = dx * bullets.vy[slot] - dy * bullets.vx[slot] >= 0 ? 1 : -1;
            awayX += bullets.vy[slot] * side * weight;
            awayY += -bullets.vx[slot] * side * weight;
        }
    }
    if (awayX === 0 && awayY === 0) {
        return undefined;
    }
    const length = Math.hypot(awayX, awayY);
    return { x: awayX / length, y: awayY / length };
}

// Away that way, or as near it as there's room (round the side, not into a wall or the boss
// square's edge), as a person circles out rather than backing into a corner
export function openWay(
    sim: Sim,
    x: number,
    y: number,
    room: (x: number, y: number) => boolean = inSquare(sim),
): { x: number; y: number } {
    const player = sim.player;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
        const cx = x * Math.cos(turn) - y * Math.sin(turn);
        const cy = x * Math.sin(turn) + y * Math.cos(turn);
        const tx = player.x + cx * 1.6;
        const ty = player.y + cy * 1.6;
        if (room(tx, ty) && !sim.grid.isSolid(Math.floor(tx), Math.floor(ty))) {
            return { x: cx, y: cy };
        }
    }
    return { x, y };
}

export type Strip = {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    half: number;
    length: number;
};

// Every lunge's strip winding up: the boss's (BossAttackDef.line), and what's copying it from
// where it stands (EnemyDef.echoes)
export function lungeStrips(sim: Sim, boss: Enemy): Strip[] {
    const strips: Strip[] = [];
    const add = (enemy: Enemy, windup: BossWindup | undefined) => {
        const line = windup?.attack.line;
        if (windup && line) {
            const { dirX, dirY } = windup;
            strips.push({
                x: enemy.x,
                y: enemy.y,
                dirX,
                dirY,
                half: line.width / 2,
                length: line.length,
            });
        }
    };
    add(boss, boss.bossState?.windup);
    for (const enemy of sim.enemies) {
        if (!enemy.dead && enemy.echo) {
            add(enemy, enemy.echo);
        }
    }
    return strips;
}

// Out of two strips or more at once, to the nearest spot none reaches, as a person finds the
// pocket between them: nothing when it's in none already, or there's nowhere
export function sharedPocket(
    sim: Sim,
    strips: Strip[],
    room: (x: number, y: number) => boolean,
): { x: number; y: number } | undefined {
    const player = sim.player;
    const inAny = (x: number, y: number, margin: number) =>
        strips.some((strip) => {
            const along = (x - strip.x) * strip.dirX + (y - strip.y) * strip.dirY;
            const side = (x - strip.x) * -strip.dirY + (y - strip.y) * strip.dirX;
            return (
                along > -1 &&
                along < strip.length + 0.5 &&
                Math.abs(side) < strip.half + player.radius + margin
            );
        });
    if (!inAny(player.x, player.y, 0.3)) {
        return undefined;
    }
    for (const reach of [0.8, 1.4, 2, 2.6, 3.4]) {
        for (let i = 0; i < 16; i++) {
            const angle = (i * Math.PI) / 8;
            const x = player.x + Math.cos(angle) * reach;
            const y = player.y + Math.sin(angle) * reach;
            if (
                room(x, y) &&
                !sim.grid.isSolid(Math.floor(x), Math.floor(y)) &&
                !inAny(x, y, 0.5)
            ) {
                return { x: Math.cos(angle), y: Math.sin(angle) };
            }
        }
    }
    return undefined;
}

// Off sparks about to land under it, in a fight in parts (Static, a lattice, a trail of its own
// steps, quicksand), or a rift still open: to the nearest spot clear of them all, or where it
// stands, just clear of one about to land. Undefined when it's clear of them.
export function offMarks(
    sim: Sim,
    room: (x: number, y: number) => boolean,
): { x: number; y: number } | undefined {
    const player = sim.player;
    const marks = sim.hazards.filter(
        (hazard) =>
            hazard.attack.ground &&
            !hazard.attack.ground.smother &&
            (hazard.landTick >= sim.tick ||
                (hazard.lingerEnd > sim.tick && (hazard.attack.ground.lingers?.damage ?? 0) > 0)) &&
            !hazard.half,
    );
    const inMark = (x: number, y: number, margin: number) =>
        marks.some(
            (hazard) =>
                Math.hypot(x - hazard.x, y - hazard.y) < hazard.radius + player.radius + margin,
        );
    const under = marks.find(
        (hazard) =>
            Math.hypot(player.x - hazard.x, player.y - hazard.y) <
            hazard.radius + player.radius + 0.3,
    );
    if (under) {
        // Straight out of the one it's in first, then round from there
        const base = Math.atan2(player.y - under.y, player.x - under.x);
        for (const reach of [1.6, 2.4]) {
            for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
                const angle = base + turn;
                const x = player.x + Math.cos(angle) * reach;
                const y = player.y + Math.sin(angle) * reach;
                if (room(x, y) && !inMark(x, y, 0.5)) {
                    return { x: Math.cos(angle), y: Math.sin(angle) };
                }
            }
        }
    } else if (
        marks.some(
            (hazard) =>
                hazard.landTick >= sim.tick &&
                Math.hypot(player.x - hazard.x, player.y - hazard.y) <
                    hazard.radius + player.radius + 0.8,
        )
    ) {
        // Just clear of one about to land: wait for it here, rather than circle back in
        // (one that's landed and lingers is only to be kept out of)
        return { x: 0, y: 0 };
    }
    return undefined;
}

// Inside the boss's square, off its edges
export function inSquare(sim: Sim): (x: number, y: number) => boolean {
    const square = sim.map.bossArena;
    return (x, y) =>
        !square ||
        (x > square.baseX + 0.6 &&
            x < square.baseX + square.size - 0.6 &&
            y > square.baseY + 0.6 &&
            y < square.baseY + square.size - 0.6);
}

// The nearest boss with its guard down, or undefined
export function exposedBoss(sim: Sim): Enemy | undefined {
    const player = sim.player;
    let best: Enemy | undefined;
    let away = Infinity;
    for (const enemy of sim.enemies) {
        if (!enemy.boss || enemy.dead || !sim.isExposed(enemy)) {
            continue;
        }
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance < away) {
            best = enemy;
            away = distance;
        }
    }
    return best;
}

// In under a boss's sandstorm, to the shelter at its feet (BossAttackDef.outside), and there
// stepping only round the bullets that stay inside it; undefined with none coming
export function shelter(sim: Sim): { x: number; y: number } | undefined {
    const player = sim.player;
    for (const enemy of sim.enemies) {
        const outside = enemy.bossState?.windup?.attack.outside;
        if (enemy.dead || outside === undefined) {
            continue;
        }
        const away = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        const safe = outside - 1;
        if (away > safe) {
            return { x: (enemy.x - player.x) / away, y: (enemy.y - player.y) / away };
        }
        const step = sidestepBullets(sim);
        if (
            step &&
            Math.hypot(player.x + step.x - enemy.x, player.y + step.y - enemy.y) < outside - 0.6
        ) {
            return step;
        }
        return { x: 0, y: 0 };
    }
    return undefined;
}

// Off a strip (a lunge's, a wave's or a thrown sword's line from x, y along dir, half wide) the
// near way, sideways, unless that's out of the room: undefined when it's not in it
export function stripStep(
    sim: Sim,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    half: number,
    room: (x: number, y: number) => boolean,
): Point | undefined {
    const player = sim.player;
    const along = (player.x - x) * dirX + (player.y - y) * dirY;
    const side = (player.x - x) * -dirY + (player.y - y) * dirX;
    if (along <= -1 || Math.abs(side) >= half + 0.8) {
        return undefined;
    }
    let sign = side >= 0 ? 1 : -1;
    const clear = half + 0.8 - Math.abs(side);
    if (!room(player.x - dirY * sign * clear, player.y + dirX * sign * clear)) {
        sign = -sign;
    }
    return { x: -dirY * sign, y: dirX * sign };
}

// Off every lunge's strip winding up (the boss's and its echoes'): with two or more, to the pocket
// none reaches; with one, off it sideways
export function lungeStep(
    sim: Sim,
    boss: Enemy,
    room: (x: number, y: number) => boolean,
): Point | undefined {
    const strips = lungeStrips(sim, boss);
    if (strips.length > 1) {
        return sharedPocket(sim, strips, room);
    }
    if (strips.length === 1) {
        const strip = strips[0];
        return stripStep(sim, strip.x, strip.y, strip.dirX, strip.dirY, strip.half, room);
    }
    return undefined;
}

// Out of a long wedge sideways, not back down it (BossAttackDef.cone, longer than minRadius):
// beside the boss is nearer than its end
export function coneStep(
    sim: Sim,
    boss: Enemy,
    windup: BossWindup | undefined,
    minRadius = 4,
    room?: (x: number, y: number) => boolean,
): Point | undefined {
    const cone = windup?.attack.kind === "swing" ? windup.attack.cone : undefined;
    if (!windup || cone === undefined || (windup.attack.radius ?? 2) <= minRadius) {
        return undefined;
    }
    const player = sim.player;
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const away = Math.max(0.001, Math.hypot(dx, dy));
    const along = (dx * windup.dirX + dy * windup.dirY) / away;
    if (away < (windup.attack.radius ?? 2) + 0.8 && along > Math.cos(cone / 2 + 0.35)) {
        const side = dx * -windup.dirY + dy * windup.dirX >= 0 ? 1 : -1;
        return openWay(sim, -windup.dirY * side, windup.dirX * side, room);
    }
    return undefined;
}

// Out of a surge's lane (BossAttackDef surge: a charge across), sideways, as it winds up or goes
export function laneStep(sim: Sim, boss: Enemy): Point | undefined {
    const state = boss.bossState;
    const lane = state?.windup?.lane ?? state?.surge?.lane;
    if (!lane) {
        return undefined;
    }
    const player = sim.player;
    const dx = lane.toX - lane.fromX;
    const dy = lane.toY - lane.fromY;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const across = ((player.x - lane.fromX) * dy - (player.y - lane.fromY) * dx) / length;
    if (Math.abs(across) < lane.halfWidth + 1) {
        const side = across >= 0 ? 1 : -1;
        return { x: (dy / length) * side, y: (-dx / length) * side };
    }
    return undefined;
}

// The fight's button (Sim.ability: a fight's own, or the raid's), pressed while what it'd land on
// has its guard down; a sloppy player sees the chance only every other second
export function pressButton(sim: Sim, sloppy = false): void {
    const sees = !sloppy || Math.floor(sim.tick / TICKS_PER_SECOND) % 2 === 0;
    const target = sees && sim.ability ? sim.abilityTarget() : undefined;
    if (target && sim.isExposed(target)) {
        sim.useAbility();
    }
}

// In to the boss whose guard is down, while the fight's button is ready and it's out of the
// button's reach; undefined otherwise
export function buttonMove(sim: Sim): Point | undefined {
    const ability = sim.ability;
    const open = exposedBoss(sim);
    const player = sim.player;
    if (
        !ability ||
        !open ||
        sim.abilitySecondsLeft() !== 0 ||
        Math.hypot(open.x - player.x, open.y - player.y) <= ability.reach - 0.5
    ) {
        return undefined;
    }
    const length = Math.max(0.001, Math.hypot(open.x - player.x, open.y - player.y));
    return { x: (open.x - player.x) / length, y: (open.y - player.y) / length };
}
