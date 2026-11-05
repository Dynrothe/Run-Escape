import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// node:sqlite arrived in Node 22.5, and package.json still allows 20; CI runs 22
const hasSqlite = await import("node:sqlite").then(
    () => true,
    () => false,
);
const { buildDatabase, splitStatements } = hasSqlite
    ? await import("./load.mjs")
    : ({} as typeof import("./load.mjs"));

const schema = readFileSync(new URL("../migrations/0001_runs.sql", import.meta.url), "utf8");
let folder: string;
let opened: { close(): void }[] = [];

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "run-escape-viewer-test-"));
    opened = [];
});
afterEach(() => {
    opened.forEach((db) => db.close());
    rmSync(folder, { recursive: true, force: true });
});

function build(...sql: string[]) {
    const db = buildDatabase(
        sql.map((text, i) => ({ name: `dump-${i}.sql`, sql: text })),
        join(folder, "viewer.db"),
    );
    opened.push(db);
    return db;
}

function run(id: string, outcome: string, characters = "archer") {
    return `INSERT INTO "runs" ("run_id","day","ended_at","received_at","version","build","play_type","relay","map_id","mode","party_size","characters","endless","outcome","duration_seconds","round","level","kills","coins","damage_dealt","dps","damage_taken","healed","highest_hit","caskets","players_left","eligible","leaderboard_score") VALUES('${id}','2026-11-05',1,1,'0.25.0','b1','singleplayer','none','lumbridge','normal',1,'${characters}',0,'${outcome}',600,10,20,500,100,50000,83.3,10,5,90,3,0,1,-600);`;
}
function daily(runs: number, day = "2026-11-05") {
    return `INSERT INTO "daily_stats" ("day","play_type","relay","map_id","mode","party_size","endless","version","outcome","runs","duration_seconds","kills","coins","damage_dealt","damage_taken","healed","highest_hit","caskets") VALUES('${day}','singleplayer','none','lumbridge','normal',1,0,'0.25.0','completed',${runs},600,500,100,50000,10,5,90,3);`;
}
const total = (db: ReturnType<typeof build>, sql: string) =>
    (db.prepare(sql).get() as { n: number }).n;

describe.skipIf(!hasSqlite)("the viewer's loader", () => {
    it("loads a full export, trigger and all, without counting its runs twice", () => {
        // An export holds the trigger and the totals it already made
        const db = build(
            `PRAGMA defer_foreign_keys=TRUE;\n${schema}\n${run("a", "completed")}\n${run("b", "completed")}\n${daily(2)}\nINSERT INTO "daily_intake" ("day","runs") VALUES('2026-11-05',2);`,
        );
        expect(total(db, "SELECT COUNT(*) AS n FROM runs")).toBe(2);
        expect(total(db, "SELECT SUM(runs) AS n FROM daily_stats")).toBe(2);
        expect(total(db, "SELECT runs AS n FROM daily_intake")).toBe(2);
    });

    it("loads a data-only export of one table", () => {
        const db = build(`PRAGMA defer_foreign_keys=TRUE;\n${daily(3)}`);
        expect(total(db, "SELECT SUM(runs) AS n FROM daily_stats")).toBe(3);
    });

    it("lets a later export replace a day an earlier one had, and keeps the rest", () => {
        const db = build(
            `${daily(3, "2026-11-04")}\n${daily(1)}`,
            `${daily(5)}\n${run("a", "failed")}`,
        );
        expect(
            db
                .prepare("SELECT day, runs FROM daily_stats ORDER BY day")
                .all()
                .map((r) => ({ ...r })),
        ).toEqual([
            { day: "2026-11-04", runs: 3 },
            { day: "2026-11-05", runs: 5 },
        ]);
    });

    it("keeps a semicolon inside a value in its statement", () => {
        expect(splitStatements(`${run("a", "failed", "x;y")}\n${daily(1)}`)).toHaveLength(2);
        const db = build(`${schema}\n${run("a", "failed", "x;y")}`);
        expect(db.prepare("SELECT characters FROM runs").get()).toEqual({ characters: "x;y" });
    });

    it("refuses a file that does more than an export does", () => {
        const target = join(folder, "written.db");
        expect(() => build(`${daily(1)}\nATTACH DATABASE '${target}' AS x;`)).toThrow(
            /isn't a D1 export/,
        );
        expect(() => build(`PRAGMA writable_schema = ON;\n${daily(1)}`)).toThrow(
            /isn't a D1 export/,
        );
        // Hidden in a comment's quote, ATTACH still isn't run
        expect(() => build(`${daily(1)} /* ' */ ; ATTACH DATABASE '${target}' AS x; -- '`)).toThrow(
            /isn't a D1 export/,
        );
        expect(existsSync(target)).toBe(false);
    });

    it("answers queries read-only", () => {
        const db = build(daily(1));
        const target = join(folder, "written.db");
        expect(() => db.exec("CREATE TABLE x (a)")).toThrow();
        expect(() => db.exec("DELETE FROM daily_stats")).toThrow();
        expect(() => db.exec(`ATTACH DATABASE '${target}' AS x`)).toThrow();
        expect(existsSync(target)).toBe(false);
        expect(total(db, "SELECT SUM(runs) AS n FROM daily_stats")).toBe(1);
    });
});
