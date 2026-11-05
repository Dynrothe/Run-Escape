// Builds the viewer's database from `wrangler d1 export` dumps. A dump is untrusted: one someone
// sent you could hold ATTACH, which writes files. Only the statements an export contains run.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

// Splits SQL at semicolons outside quotes; a trigger's body runs to its END.
export function splitStatements(sql) {
    const statements = [];
    let start = 0;
    let quote = "";
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];
        if (quote) {
            if (c === quote) {
                quote = "";
            }
        } else if (c === "'" || c === '"' || c === "`") {
            quote = c;
        } else if (c === "[") {
            quote = "]";
        } else if (c === "-" && sql[i + 1] === "-") {
            const end = sql.indexOf("\n", i);
            i = end === -1 ? sql.length : end;
        } else if (c === "/" && sql[i + 1] === "*") {
            const end = sql.indexOf("*/", i + 2);
            i = end === -1 ? sql.length : end + 1;
        } else if (c === ";") {
            const statement = withoutLeadingComments(sql.slice(start, i));
            if (/^CREATE\s+(TEMP\w*\s+)?TRIGGER\b/i.test(statement) && !/\bEND$/i.test(statement)) {
                continue;
            }
            if (statement) {
                statements.push(statement);
            }
            start = i + 1;
        }
    }
    const rest = withoutLeadingComments(sql.slice(start));
    if (rest) {
        statements.push(rest);
    }
    return statements;
}

function withoutLeadingComments(sql) {
    let text = sql.trim();
    for (;;) {
        if (text.startsWith("--")) {
            const end = text.indexOf("\n");
            text = end === -1 ? "" : text.slice(end + 1).trim();
        } else if (text.startsWith("/*")) {
            const end = text.indexOf("*/");
            text = end === -1 ? "" : text.slice(end + 2).trim();
        } else {
            return text;
        }
    }
}

const NAME = String.raw`(?:"[^"]+"|\w+)`;
const RUN = [
    new RegExp(String.raw`^INSERT\s+INTO\s+${NAME}`, "i"),
    new RegExp(String.raw`^CREATE\s+TABLE\s+`, "i"),
    new RegExp(String.raw`^CREATE\s+(UNIQUE\s+)?INDEX\s+`, "i"),
    new RegExp(String.raw`^DELETE\s+FROM\s+"?sqlite_sequence"?$`, "i"),
];
// In exports but not wanted: the trigger would count the dump's runs into daily_stats again
const SKIP = [/^PRAGMA\s+defer_foreign_keys\b/i, /^CREATE\s+(TEMP\w*\s+)?(TRIGGER|VIEW)\b/i];

function prepareDump(name, sql) {
    const statements = [];
    for (const statement of splitStatements(sql)) {
        if (SKIP.some((re) => re.test(statement))) {
            continue;
        }
        if (!RUN.some((re) => re.test(statement))) {
            throw new Error(
                `${name} isn't a D1 export: it has \`${statement.slice(0, 60).replace(/\s+/g, " ")}\``,
            );
        }
        statements.push(
            statement
                .replace(/^INSERT\s+INTO\s+/i, "INSERT OR REPLACE INTO ")
                .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
                .replace(
                    /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/i,
                    "CREATE $1INDEX IF NOT EXISTS ",
                ),
        );
    }
    return statements;
}

// Writes the database to `path` from the schema and `dumps` ({ name, sql }) in order, a later
// row replacing an earlier one with the same key, then reopens it read-only for queries.
export function buildDatabase(dumps, path) {
    const prepared = dumps.map(({ name, sql }) => prepareDump(name, sql));
    const db = new DatabaseSync(path);
    try {
        for (const name of readdirSync(migrations)
            .filter((n) => n.endsWith(".sql"))
            .sort()) {
            db.exec(readFileSync(join(migrations, name), "utf8"));
        }
        for (const { name } of db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
            .all()) {
            db.exec(`DROP TRIGGER "${name}"`);
        }
        db.exec("BEGIN");
        for (const [i, statements] of prepared.entries()) {
            for (const statement of statements) {
                try {
                    db.prepare(statement).run();
                } catch (error) {
                    throw new Error(`${dumps[i].name}: ${error.message}`);
                }
            }
        }
        db.exec("COMMIT");
    } finally {
        db.close();
    }
    return new DatabaseSync(path, { readOnly: true });
}
