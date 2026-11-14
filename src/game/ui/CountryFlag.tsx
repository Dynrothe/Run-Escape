import { FLAG_FRAMES, FLAG_SPRITE } from "../content/flags";
import { getLang, useLang } from "../i18n";
import { useSpriteFrame } from "./useSpriteFrame";

let regionNames: { lang: string; names: Intl.DisplayNames } | undefined;

// A country's name ("Finland"), or its letters where the browser doesn't know it
export function countryName(code: string): string {
    try {
        const lang = getLang();
        if (regionNames?.lang !== lang) {
            regionNames = { lang, names: new Intl.DisplayNames([lang], { type: "region" }) };
        }
        return regionNames.names.of(code) ?? code;
    } catch {
        return code;
    }
}

type Props = {
    // ISO 3166's two letters, as the relay sends them. Nothing's shown without.
    country?: string;
    // Before the country's name, for the tooltip: "Server in"
    label: string;
    // An empty space the flag's size without a country, to keep rows in line
    keepSpace?: boolean;
};

// Where a co-op player's playing from: their country's flag from the world list,
// or its letters for a country without one
export function CountryFlag({ country, label, keepSpace }: Props): JSX.Element | null {
    useLang();
    const frame = country !== undefined ? FLAG_FRAMES[country] : undefined;
    const url = useSpriteFrame(FLAG_SPRITE, frame);
    if (!country) {
        return keepSpace ? <span className="ui-flag" /> : null;
    }
    const text = `${label} ${countryName(country)}`;
    // No flag for it (or not in this cache): its letters
    if (frame === undefined || url === "") {
        return (
            <span className="ui-flag ui-flag-code" role="img" aria-label={text} title={text}>
                {country}
            </span>
        );
    }
    return url ? (
        <img className="ui-flag" src={url} alt={text} title={text} draggable={false} />
    ) : (
        <span className="ui-flag" />
    );
}
