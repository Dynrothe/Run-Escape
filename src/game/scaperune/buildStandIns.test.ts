import { expect, test } from "vitest";

import { MapGeneratorButton } from "./MapGeneratorScreen";
import { MapGeneratorButton as ButtonStandIn } from "./MapGeneratorScreen.build";
import { SCAPERUNE_DEV_MAPS } from "./maps/devMaps";
import { SCAPERUNE_DEV_MAPS as MapsStandIn } from "./maps/devMaps.build";

// vite.config.ts swaps these in for a build: anything the game imports from the
// real files has to be here too, or the build fails
test("a build's stand-ins export what the game imports", () => {
    expect(SCAPERUNE_DEV_MAPS.length).toBeGreaterThan(0);
    expect(MapsStandIn).toEqual([]);
    expect(typeof MapGeneratorButton).toBe("function");
    expect(ButtonStandIn({ client: undefined as never })).toBeNull();
});
