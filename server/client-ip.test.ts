import { addressList, clientAddress, plainAddress } from "./client-ip.mjs";

const PROXIES = addressList(["127.0.0.0/8", "10.0.0.0/8", "::1/128"]);
const CLOUDFLARE = addressList(["173.245.48.0/20", "2606:4700::/32"]);

function from(remoteAddress: string, headers: Record<string, string> = {}): string {
    return clientAddress({ headers }, { remoteAddress }, PROXIES, CLOUDFLARE);
}

describe("client addresses", () => {
    it("are the connection's own with no proxy in front", () => {
        expect(from("203.0.113.9")).toBe("203.0.113.9");
        expect(from("::ffff:203.0.113.9")).toBe("203.0.113.9");
    });

    it("don't believe headers from anyone but a proxy of ours", () => {
        expect(from("203.0.113.9", { "x-forwarded-for": "1.2.3.4" })).toBe("203.0.113.9");
        expect(from("203.0.113.9", { "cf-connecting-ip": "1.2.3.4" })).toBe("203.0.113.9");
    });

    it("take a local proxy's word for who it saw, and only that", () => {
        // A player can send X-Forwarded-For themselves; the proxy adds who it
        // really saw at the end
        expect(from("127.0.0.1", { "x-forwarded-for": "6.6.6.6, 198.51.100.7" })).toBe(
            "198.51.100.7",
        );
        expect(from("::1", { "x-forwarded-for": "198.51.100.7" })).toBe("198.51.100.7");
        // Two proxies of ours in a row
        expect(from("127.0.0.1", { "x-forwarded-for": "198.51.100.7, 10.0.0.5" })).toBe(
            "198.51.100.7",
        );
    });

    it("believe Cloudflare's header only from Cloudflare", () => {
        // Straight from Cloudflare
        expect(from("173.245.48.10", { "cf-connecting-ip": "198.51.100.7" })).toBe("198.51.100.7");
        // Cloudflare, then a proxy of ours
        expect(
            from("127.0.0.1", {
                "x-forwarded-for": "198.51.100.7, 173.245.48.10",
                "cf-connecting-ip": "198.51.100.7",
            }),
        ).toBe("198.51.100.7");
        // Round Cloudflare, straight to the proxy, with a made-up header
        expect(
            from("127.0.0.1", {
                "x-forwarded-for": "203.0.113.9",
                "cf-connecting-ip": "1.2.3.4",
            }),
        ).toBe("203.0.113.9");
        expect(from("2606:4700::1", { "cf-connecting-ip": "2001:db8::7" })).toBe("2001:db8::7");
    });

    it("read addresses however they're written", () => {
        expect(plainAddress("198.51.100.7:5123")).toBe("198.51.100.7");
        expect(plainAddress("[2001:db8::7]:443")).toBe("2001:db8::7");
        expect(plainAddress("not an address")).toBeUndefined();
        expect(from("127.0.0.1", { "x-forwarded-for": "garbage" })).toBe("127.0.0.1");
    });
});
