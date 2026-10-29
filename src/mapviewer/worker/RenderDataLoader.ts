import { SerializerImplementation } from "threads";

import { ActorBakeLoader } from "../webgl/actor/ActorBakeLoader";
import { SdMapDataLoader } from "../webgl/loader/SdMapDataLoader";
import { ItemIconLoader } from "./ItemIconLoader";
import { RegionDataLoader } from "./RegionDataLoader";
import { WorkerState } from "./RenderDataWorker";
import { SoundLoader } from "./SoundLoader";
import { SpriteDataLoader } from "./SpriteDataLoader";

export type RenderDataResult<T> = {
    data: T;
    transferables: Transferable[];
};

export interface RenderDataLoader<I, D> {
    // Used by serializer
    __type: keyof RenderDataLoaders;

    init(): void;

    load(state: WorkerState, input: I): Promise<RenderDataResult<D>>;

    reset(): void;
}

const loaders = {
    sdMapDataLoader: new SdMapDataLoader(),
    actorBakeLoader: new ActorBakeLoader(),
    regionDataLoader: new RegionDataLoader(),
    itemIconLoader: new ItemIconLoader(),
    soundLoader: new SoundLoader(),
    spriteDataLoader: new SpriteDataLoader(),
};

type RenderDataLoaders = typeof loaders;

const loaderSerializerNamePrefix = "$RenderDataLoader$";

export const renderDataLoaderSerializer: SerializerImplementation = {
    serialize(value, defaultHandler) {
        if (value && value.__type) {
            return loaderSerializerNamePrefix + value.__type;
        } else {
            return defaultHandler(value);
        }
    },
    deserialize(value, defaultHandler) {
        if (value && typeof value === "string" && value.startsWith(loaderSerializerNamePrefix)) {
            const type = value.substring(loaderSerializerNamePrefix.length);
            if (type in loaders) {
                return loaders[type as keyof RenderDataLoaders];
            }
            throw new Error("Unknown loader type: " + type);
        } else {
            return defaultHandler(value);
        }
    },
};
