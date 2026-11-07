import { MapDef } from "../../content/types";
import { MapRecipe } from "../recipe";

// What a build gets instead of devMaps.ts (vite.config.ts)
export const SCAPERUNE_DEV_MAPS: MapRecipe[] = [];
export const SCAPERUNE_DEV_FIGHTS: { recipe: MapRecipe; map: MapDef }[] = [];
