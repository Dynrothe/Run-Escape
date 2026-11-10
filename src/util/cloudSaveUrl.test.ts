import { cloudSaveUrl, isCloudSaveRequest } from "./cloudSaveUrl";

it("takes the Worker's origin, and nothing with a path, credentials or plain http", () => {
    expect(cloudSaveUrl("https://saves.example")).toBe("https://saves.example");
    expect(cloudSaveUrl("https://saves.example/")).toBe("https://saves.example");
    expect(cloudSaveUrl("https://Saves.Example:8443")).toBe("https://saves.example:8443");
    expect(cloudSaveUrl("http://localhost:8791")).toBe("http://localhost:8791");
    for (const bad of [
        undefined,
        "",
        "http://saves.example",
        "https://saves.example/v1/save",
        "https://name@saves.example",
        "https://saves.example?x=1",
        "https://saves.example#x",
        "wss://saves.example",
        "not a url",
    ]) {
        expect(cloudSaveUrl(bad), String(bad)).toBeUndefined();
    }
});

it("lets the game's requests out to the Worker's /v1/ alone", () => {
    const origin = "https://saves.example";
    for (const method of ["GET", "PUT", "POST", "DELETE", "OPTIONS"]) {
        expect(isCloudSaveRequest(method, `${origin}/v1/save`, origin)).toBe(true);
    }
    expect(isCloudSaveRequest("GET", `${origin}/v1/save`, undefined)).toBe(false);
    expect(isCloudSaveRequest("PATCH", `${origin}/v1/save`, origin)).toBe(false);
    expect(isCloudSaveRequest("GET", `${origin}/`, origin)).toBe(false);
    expect(isCloudSaveRequest("GET", `${origin}/v1/save?x=1`, origin)).toBe(false);
    expect(isCloudSaveRequest("GET", "https://saves.example.evil.test/v1/save", origin)).toBe(
        false,
    );
    expect(isCloudSaveRequest("GET", "https://name@saves.example/v1/save", origin)).toBe(false);
    expect(isCloudSaveRequest("GET", "http://saves.example/v1/save", origin)).toBe(false);
});
