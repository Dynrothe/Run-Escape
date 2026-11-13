import { describe, expect, test } from "vitest";

import { isTrailerFile, muxArgs, readSpec, trailerName, videoArgs } from "./trailer-server";

describe("the trailer server", () => {
    test("takes a trailer's size and rate, and a name that's safe for a file", () => {
        const query = new URLSearchParams("width=1920&height=1080&fps=60&name=../../etc/x y");
        expect(readSpec(query)).toEqual({ name: "etc-x-y", width: 1920, height: 1080, fps: 60 });
        expect(trailerName("")).toBe("trailer");
        expect(trailerName("varrock-20261108-210509")).toBe("varrock-20261108-210509");
    });

    test("turns away sides H.264 can't take, and rates out of reach", () => {
        expect(readSpec(new URLSearchParams("width=1921&height=1080&fps=60"))).toMatch(/width/);
        expect(readSpec(new URLSearchParams("width=1920&height=0&fps=60"))).toMatch(/height/);
        expect(readSpec(new URLSearchParams("width=1920&height=1080&fps=0.5"))).toMatch(/fps/);
    });

    test("pipes raw frames into ffmpeg, and adds the sound without touching the video", () => {
        const args = videoArgs({ name: "t", width: 1280, height: 720, fps: 30 }, "out.mp4");
        expect(args.join(" ")).toContain("-f rawvideo -pix_fmt rgba -s 1280x720 -framerate 30");
        expect(args.join(" ")).toContain("-i pipe:0");
        expect(args[args.length - 1]).toBe("out.mp4");
        const mux = muxArgs("v.mp4", "a.wav", "out.mp4").join(" ");
        expect(mux).toContain("-i v.mp4 -i a.wav");
        expect(mux).toContain("-c:v copy");
    });

    test("keeps trailers out of the file watcher", () => {
        expect(isTrailerFile(`${process.cwd()}/trailers/a.video.mp4`)).toBe(true);
        expect(isTrailerFile(`${process.cwd()}/trailers-not/a.mp4`)).toBe(false);
        expect(isTrailerFile(`${process.cwd()}/src/game/client/GameClient.ts`)).toBe(false);
    });
});
