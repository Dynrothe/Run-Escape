import changelogText from "../../../CHANGELOG.md?raw";

export const GAME_VERSION = __APP_VERSION__;

export type ChangelogSection = { heading: string; items: string[] };

export type ChangelogVersion = {
    // "0.10.0", or "Unreleased"
    version: string;
    date?: string;
    sections: ChangelogSection[];
};

// CHANGELOG.md read the way it's written: "## 0.10.0 - 2026-10-27" for a
// version, "### Added" for a kind of change, and "- " for an item, whose
// wrapped lines are indented. Anything else (the intro) is left out.
export function parseChangelog(text: string): ChangelogVersion[] {
    const versions: ChangelogVersion[] = [];
    let section: ChangelogSection | undefined;
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("## ")) {
            const [version, date] = line.slice(3).trim().split(" - ");
            versions.push({ version, date, sections: [] });
            section = undefined;
        } else if (line.startsWith("### ") && versions.length > 0) {
            section = { heading: line.slice(4).trim(), items: [] };
            versions[versions.length - 1].sections.push(section);
        } else if (line.startsWith("- ") && section) {
            section.items.push(line.slice(2).trim());
        } else if (/^\s+\S/.test(line) && section && section.items.length > 0) {
            section.items[section.items.length - 1] += " " + line.trim();
        }
    }
    return versions;
}

export const CHANGELOG = parseChangelog(changelogText);
