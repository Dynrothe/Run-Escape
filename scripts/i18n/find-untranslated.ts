// Lists English shown in the game's screens that doesn't go through the language files: JSX text,
// the attributes a player sees or hears (title, aria-label, placeholder, alt), and strings and
// templates a JSX expression shows straight (`{done ? "Room done" : ...}`). Text inside t(),
// tp(), tr() or tl() is fine, as are the dev-only screens. It's a list to look through, not a
// check: an id or a CSS class that looks like words can turn up.
//
//   bun run tsx scripts/i18n/find-untranslated.ts [--json]
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = "src/game";
const DEV_ONLY = new Set([
    "FloorPreview.tsx",
    "DirectorPanel.tsx",
    "MapGeneratorScreen.tsx",
    "PortraitsPage.tsx",
    "DebugPanel.tsx",
]);
const SEEN_ATTRIBUTES = new Set(["title", "aria-label", "placeholder", "alt"]);
// Attributes that are never shown: classes, ids and the like
const UNSEEN_ATTRIBUTES = new Set([
    "className",
    "id",
    "key",
    "htmlFor",
    "role",
    "aria-controls",
    "aria-labelledby",
    "aria-describedby",
    "href",
    "src",
    "type",
    "name",
    "fill",
    "stroke",
    "mask",
    "clipPath",
    "filter",
]);
// The ?devtools buttons say so in their text, and players never see them
const DEV_TEXT = /\(dev\)|^God mode/;
// The game's own name
const NAMES = new Set(["Run Escape"]);
const TRANSLATED = new Set(["t", "tp", "tr", "tl", "list", "fmtNum"]);
// Words, not an id, a class or a number
const WORDS = /[A-Za-z]{2,}/;
const CODE_LIKE = /^[a-z0-9_.\-:/#]+$|^[A-Z0-9_]+$/;

export type Untranslated = { file: string; line: number; kind: string; text: string };

function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return files(full);
        }
        return entry.name.endsWith(".tsx") &&
            !entry.name.endsWith(".test.tsx") &&
            !DEV_ONLY.has(entry.name)
            ? [full]
            : [];
    });
}

// Inside a call to one of the language functions, however deep
function translated(node: ts.Node): boolean {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (ts.isCallExpression(at)) {
            const callee = at.expression;
            const name = ts.isIdentifier(callee)
                ? callee.text
                : ts.isPropertyAccessExpression(callee)
                  ? callee.name.text
                  : "";
            if (TRANSLATED.has(name)) {
                return true;
            }
        }
        if (ts.isJsxElement(at) || ts.isJsxSelfClosingElement(at) || ts.isSourceFile(at)) {
            return false;
        }
    }
    return false;
}

// A string shown as it is: the whole of a JSX expression, or one branch of a ?: or ?? there
function shownStraight(node: ts.Node): boolean {
    let at = node.parent;
    while (
        at &&
        (ts.isConditionalExpression(at) ||
            ts.isParenthesizedExpression(at) ||
            (ts.isBinaryExpression(at) &&
                (at.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
                    at.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                    at.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)))
    ) {
        if (ts.isConditionalExpression(at) && at.condition === node) {
            return false;
        }
        node = at;
        at = at.parent;
    }
    return at !== undefined && ts.isJsxExpression(at);
}

function looksLikeText(text: string): boolean {
    const trimmed = text.trim();
    return (
        WORDS.test(trimmed) &&
        !CODE_LIKE.test(trimmed) &&
        !DEV_TEXT.test(trimmed) &&
        !NAMES.has(trimmed)
    );
}

// Inside an attribute that's never shown (a class name built up, an id)
function inUnseenAttribute(node: ts.Node): boolean {
    for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (ts.isJsxAttribute(at)) {
            return UNSEEN_ATTRIBUTES.has(at.name.getText());
        }
        if (ts.isJsxElement(at) || ts.isJsxSelfClosingElement(at)) {
            return false;
        }
    }
    return false;
}

export function findUntranslated(): Untranslated[] {
    const found: Untranslated[] = [];
    for (const file of files(ROOT)) {
        const source = ts.createSourceFile(
            file,
            fs.readFileSync(file, "utf8"),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        const add = (node: ts.Node, kind: string, text: string) =>
            found.push({
                file: file.replace(/\\/g, "/"),
                line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                kind,
                text: text.replace(/\s+/g, " ").trim(),
            });
        const visit = (node: ts.Node): void => {
            if (ts.isJsxText(node) && looksLikeText(node.text)) {
                add(node, "text", node.text);
            } else if (
                ts.isJsxAttribute(node) &&
                SEEN_ATTRIBUTES.has(node.name.getText()) &&
                node.initializer &&
                ts.isStringLiteral(node.initializer) &&
                looksLikeText(node.initializer.text)
            ) {
                add(node, node.name.getText(), node.initializer.text);
            } else if (
                (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
                looksLikeText(node.text) &&
                shownStraight(node) &&
                !translated(node) &&
                !inUnseenAttribute(node)
            ) {
                add(node, "expression", node.text);
            } else if (
                ts.isTemplateExpression(node) &&
                shownStraight(node) &&
                !translated(node) &&
                !inUnseenAttribute(node)
            ) {
                const text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
                    .join("…")
                    .trim();
                if (looksLikeText(text)) {
                    add(node, "template", node.getText().slice(1, -1));
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    return found;
}

if (process.argv[1]?.includes("find-untranslated")) {
    const found = findUntranslated();
    if (process.argv.includes("--json")) {
        console.log(JSON.stringify(found, null, 2));
    } else {
        for (const { file, line, kind, text } of found) {
            console.log(`${file}:${line} [${kind}] ${text}`);
        }
        console.log(`${found.length} found`);
    }
}
