import worker from "./src/index.mjs";

describe("Cloudflare co-op routing and country", () => {
    it("forwards the client's CF country, not its headers or the edge's location", async () => {
        const fetchRoom = vi.fn(async () => new Response(null, { status: 403 }));
        const getRoom = vi.fn(() => ({ fetch: fetchRoom }));
        const idFromName = vi.fn((name: string) => `id:${name}`);
        const request = new Request("https://relay/coop/room/ABCDEFGH?ticket=invalid", {
            headers: { Upgrade: "websocket", "x-country": "US" },
        });
        Object.assign(request, { cf: { country: "FI", colo: "ARN" } });

        const response = await worker.fetch(request, {
            ROOMS: { idFromName, get: getRoom },
        });
        expect(response.status).toBe(403);
        expect(idFromName).toHaveBeenCalledWith("ABCDEFGH");
        expect(getRoom).toHaveBeenCalledWith("id:ABCDEFGH");
        // The room is contacted even with an invalid ticket; authentication
        // currently happens inside it. This does not test geographic placement.
        expect(fetchRoom).toHaveBeenCalledOnce();
        const headers = (fetchRoom.mock.calls[0] as any)[1].headers as Headers;
        expect(headers.get("x-country")).toBe("FI");
    });
});
