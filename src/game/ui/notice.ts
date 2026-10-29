// A notice for players, from public/notice.md, shown on the title screen
// until they close it. It's fetched rather than bundled so a hosted game's
// notice can be changed without building again.

export type NoticeBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

export type Notice = {
    title?: string;
    blocks: NoticeBlock[];
    // Changes with the text, so a new notice is shown again
    key: string;
};

const SEEN_KEY = "rune-survivors-notice-seen";

// notice.md read the way it's written: an optional "# Title" first, then
// paragraphs and "- " lists split by blank lines, with wrapped lines joined.
// Comments are left out, and with nothing else there's no notice.
export function parseNotice(text: string): Notice | undefined {
    const body = text
        .replace(/\r\n/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();
    if (!body) {
        return undefined;
    }
    const lines = body.split("\n");
    let title: string | undefined;
    if (lines[0].startsWith("# ")) {
        title = lines.shift()!.slice(2).trim();
    }
    const blocks: NoticeBlock[] = [];
    // What the next line continues, until a blank line
    let block: NoticeBlock | undefined;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            block = undefined;
        } else if (trimmed.startsWith("- ")) {
            if (block?.kind !== "list") {
                block = { kind: "list", items: [] };
                blocks.push(block);
            }
            block.items.push(trimmed.slice(2).trim());
        } else if (block?.kind === "list" && line !== trimmed) {
            block.items[block.items.length - 1] += " " + trimmed;
        } else if (block?.kind === "paragraph") {
            block.text += " " + trimmed;
        } else {
            block = { kind: "paragraph", text: trimmed };
            blocks.push(block);
        }
    }
    return { title, blocks, key: hashText(body) };
}

function hashText(text: string): string {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = (Math.imul(hash, 33) + text.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(36);
}

let noticePromise: Promise<Notice | undefined> | undefined;

// Once a page load. A missing or unreadable notice is no notice.
export function loadNotice(): Promise<Notice | undefined> {
    if (!noticePromise) {
        noticePromise = fetch("notice.md", { cache: "no-cache" })
            .then(async (response) => {
                // The dev server answers a missing file with the page itself
                const type = response.headers.get("Content-Type") ?? "";
                if (!response.ok || type.includes("text/html")) {
                    return undefined;
                }
                return parseNotice(await response.text());
            })
            .catch(() => undefined);
    }
    return noticePromise;
}

export function shouldShowNotice(notice: Notice): boolean {
    if (new URLSearchParams(window.location.search).has("notice")) {
        return true;
    }
    try {
        return window.localStorage.getItem(SEEN_KEY) !== notice.key;
    } catch (e) {
        return true;
    }
}

export function markNoticeSeen(notice: Notice): void {
    try {
        window.localStorage.setItem(SEEN_KEY, notice.key);
    } catch (e) {}
}
