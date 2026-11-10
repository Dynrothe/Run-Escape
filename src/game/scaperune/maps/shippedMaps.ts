import { MapRecipe } from "../recipe";
import { GHORROCK_RECIPE } from "./ghorrock";
import { HALLOWED_NIGHT } from "./hallowedNight";
import { LASSAR_RECIPE } from "./lassarUndercity";
import { OWLS_COURT_RECIPE } from "./owlsCourt";
import { SCAR_RECIPE } from "./scar";
import { SISTERHOOD_SANCTUARY } from "./sisterhoodSanctuary";
import { STRANGLEWOOD_RECIPE } from "./stranglewood";
import { THEATRE_OF_BLOOD } from "./theatreOfBlood";
import { BENEATH_CURSED_SANDS_RECIPE, TOMBS_OF_AMASCUT } from "./tombsOfAmascut";

// Recipes behind real maps in MAPS: these ship, and DEV_MAPS has nothing to do with them
export const SCAPERUNE_MAPS: MapRecipe[] = [
    HALLOWED_NIGHT,
    SISTERHOOD_SANCTUARY,
    THEATRE_OF_BLOOD,
    OWLS_COURT_RECIPE,
    STRANGLEWOOD_RECIPE,
    LASSAR_RECIPE,
    GHORROCK_RECIPE,
    SCAR_RECIPE,
    TOMBS_OF_AMASCUT,
    BENEATH_CURSED_SANDS_RECIPE,
];
