// A stand-in for the Cache API, for tests: each response's bytes and headers, keyed by URL
export class FakeCache {
    readonly entries = new Map<string, Uint8Array>();
    readonly headers = new Map<string, Headers>();
    // Out of room, for these
    refusePut: (url: string) => boolean = () => false;
    private readonly writes: Promise<unknown>[] = [];

    async match(request: RequestInfo | URL): Promise<Response | undefined> {
        const url = urlOf(request);
        const data = this.entries.get(url);
        return data && new Response(data.slice(), { headers: this.headers.get(url) });
    }

    async matchAll(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response[]> {
        const strip = (url: string) => (options?.ignoreSearch ? url.split("?")[0] : url);
        const wanted = strip(urlOf(request));
        const urls = [...this.entries.keys()].filter((url) => strip(url) === wanted);
        return Promise.all(urls.map(async (url) => (await this.match(url))!));
    }

    put(request: RequestInfo | URL, response: Response): Promise<void> {
        const url = urlOf(request);
        const write = (async () => {
            if (this.refusePut(url)) {
                throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
            }
            this.entries.set(url, new Uint8Array(await response.arrayBuffer()));
            this.headers.set(url, new Headers(response.headers));
        })();
        this.writes.push(write);
        return write;
    }

    async delete(request: RequestInfo | URL): Promise<boolean> {
        const url = urlOf(request);
        this.headers.delete(url);
        return this.entries.delete(url);
    }

    async keys(): Promise<Request[]> {
        return [...this.entries.keys()].map((url) => new Request(url));
    }

    // Once every put so far has finished, whether it worked or not: a download that's cut off
    // leaves its last ones going
    async settled(): Promise<void> {
        await Promise.allSettled(this.writes);
    }
}

function urlOf(request: RequestInfo | URL): string {
    return request instanceof Request ? request.url : String(request);
}
