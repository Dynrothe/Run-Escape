// Finds places in the world by what they're made of, from the world index (world-index.ts): map
// squares whose floor is mostly a colour, or that have certain locs, on a level, on the surface or
// not. Squares that touch are one place: it prints each place's squares and the box round them,
// in world tiles, the biggest first.
//
//   npx tsx scripts/scaperune/world-index.ts world.json    # once
//   npx tsx scripts/scaperune/find-place.ts world.json colour=red surface=0
//   npx tsx scripts/scaperune/find-place.ts world.json name=bloodsplatter locs=10
//
// Options:
//   colour=NAME    floor colour by name: red, brown, yellow, green, blue, purple, grey, white, black
//   colour=RRGGBB  or by hex, with within=N for how far off it can be (RGB distance, default 40)
//   share=F        the least share of the floor in that colour (default 0.5, "mostly")
//   loc=ID,ID      squares with these loc ids on them
//   name=PATTERN   squares with locs whose names match (a regular expression, any case)
//   locs=N         the least of those locs a square has (default 1)
//   plane=N        the level to look at (default 0, the ground floor)
//   surface=1      the surface only (squares south of y 6400); surface=0 everywhere else
//   places=N       how many places to print (default 10)
import fs from "node:fs";

import { COLOURS, ColourName, PlaceFilter, findPlaces, groupPlaces } from "./place-search";

const [file, ...args] = process.argv.slice(2);
const options = new Map(
    args.map((arg) => [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]),
);
if (!file || args.some((arg) => !arg.includes("="))) {
    console.log(
        "Usage: find-place.ts world.json [colour=NAME|RRGGBB] [within=N] [share=F] [loc=ID,ID] " +
            "[name=PATTERN] [locs=N] [plane=N] [surface=1|0] [places=N]",
    );
    process.exit(1);
}
const filter: PlaceFilter = {};
const colour = options.get("colour");
if (colour !== undefined) {
    if ((COLOURS as readonly string[]).includes(colour)) {
        filter.colour = colour as ColourName;
    } else if (/^[0-9a-f]{6}$/i.test(colour)) {
        filter.colour = { rgb: parseInt(colour, 16), within: Number(options.get("within") ?? 40) };
    } else {
        throw new Error(`Not a colour: ${colour} (${COLOURS.join(", ")}, or RRGGBB)`);
    }
}
if (options.has("share")) {
    filter.share = Number(options.get("share"));
}
if (options.has("loc")) {
    filter.locIds = options.get("loc")!.split(",").map(Number);
}
if (options.has("name")) {
    filter.locName = new RegExp(options.get("name")!, "i");
}
if (options.has("locs")) {
    filter.minLocs = Number(options.get("locs"));
}
if (options.has("plane")) {
    filter.plane = Number(options.get("plane"));
}
if (options.has("surface")) {
    filter.surface = options.get("surface") === "1";
}

const index = JSON.parse(fs.readFileSync(file, "utf8"));
if (filter.plane && !index.squares.some((square: { upper?: object }) => square.upper)) {
    throw new Error("This index has no upper levels: make it again with world-index.ts");
}
const matches = findPlaces(index, filter);
const places = groupPlaces(matches);
console.log(`${matches.length} squares in ${places.length} places`);
for (const place of places.slice(0, Number(options.get("places") ?? 10))) {
    const squares = place.squares
        .slice(0, 12)
        .map((square) => {
            const share = filter.colour ? ` ${Math.round(square.share * 100)}%` : "";
            const locs = square.locs ? ` ${square.locs} locs` : "";
            return `${square.x},${square.y}${share}${locs}`;
        })
        .join(", ");
    const more = place.squares.length > 12 ? `, and ${place.squares.length - 12} more` : "";
    console.log(
        `${place.squares.length} squares, x ${place.x0} to ${place.x1}, y ${place.y0} to ${place.y1}`,
    );
    console.log(`  ${squares}${more}`);
}
