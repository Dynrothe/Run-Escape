import type { Program } from "picogl";

export type ProgramSource = [string, string];

export function prependDefines(source: string, defines: string[]): string {
    const header = "#version 300 es";

    const newHeader = defines.reduce((acc, define) => {
        return acc + "#define " + define + " 1\n";
    }, header + "\n");

    return source.replace(header, newHeader);
}

// Whether a program reads a lit map's light map (its LIGHTS): picogl doesn't type its samplers
export function readsLightMap(program: Program): boolean {
    return (
        (program as unknown as { samplers: Record<string, number> }).samplers["u_lightMap"] !==
        undefined
    );
}
