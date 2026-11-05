import { MapRecipe } from "../recipe";
import { HALLOWED_NIGHT } from "./hallowedNight";
import { OWLS_COURT_RECIPE } from "./owlsCourt";
import { SISTERHOOD_SANCTUARY } from "./sisterhoodSanctuary";
import { SUNKEN_CATHEDRAL_RECIPE } from "./sunkenCathedral";
import { THEATRE_OF_BLOOD } from "./theatreOfBlood";

// Recipes behind real maps in MAPS: these ship, and DEV_MAPS has nothing to do with them
export const SCAPERUNE_MAPS: MapRecipe[] = [
    HALLOWED_NIGHT,
    SISTERHOOD_SANCTUARY,
    THEATRE_OF_BLOOD,
    OWLS_COURT_RECIPE,
    SUNKEN_CATHEDRAL_RECIPE,
];
