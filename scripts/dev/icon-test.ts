// Draws a few inventory icons in Node and prints them as ASCII, to check the
// icon renderer without a browser.
//
//   npx tsx scripts/dev/icon-test.ts 1321 995
import { ICON_HEIGHT, ICON_WIDTH, renderItemIcon } from "../../src/mapviewer/worker/ItemIconLoader";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { ObjModelLoader } from "../../src/rs/config/objtype/ObjModelLoader";
import { loadGameCache } from "../cache/scene-util";

const loaded = loadGameCache();
const factory = getCacheLoaderFactory(
    loaded.info,
    CacheSystem.fromFiles(loaded.type, loaded.files),
);
const objTypeLoader = factory.getObjTypeLoader();
const textureLoader = factory.getTextureLoader();
const objModelLoader = new ObjModelLoader(objTypeLoader, factory.getModelLoader(), textureLoader);
const state = { objTypeLoader, objModelLoader, textureLoader } as any;

for (const arg of process.argv.slice(2)) {
    const objId = parseInt(arg);
    const pixels = renderItemIcon(state, objId, objId === 995 ? 1000 : 1);
    const obj = objTypeLoader.load(objId);
    console.log(
        `${objId} ${obj.name}: ${pixels.filter((p) => p !== 0).length} pixels (zoom ${obj.zoom2d} x ${obj.xan2d} y ${obj.yan2d} z ${obj.zan2d})`,
    );
    for (let y = 0; y < ICON_HEIGHT; y++) {
        let row = "";
        for (let x = 0; x < ICON_WIDTH; x++) {
            const p = pixels[x + y * ICON_WIDTH] & 0xffffff;
            const a = pixels[x + y * ICON_WIDTH] >>> 24;
            row += a === 0 ? " " : p === 0x010101 ? "#" : p === 0x302020 ? "." : "o";
        }
        console.log("|" + row + "|");
    }
}
