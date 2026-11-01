import { Identity } from "spacetimedb";
import { RunResult } from "../core/Sim";
import { EndlessRecord, SaveData, mergeSaves, migrateSave } from "../core/save";
import { validateDisplayName, verifyRunResult } from "./anticheat";
import { DbConnection, ErrorContext, EventContext } from "./bindings";
import {
    AuthzGrant,
    AuthzRole,
    AuthzScope,
    LeaderboardEndless,
    LeaderboardStandard,
    PlayerSave,
    RunSubmission,
    SavePayload,
} from "./bindings/types";

const TOKEN_KEY = "rune-survivors-stdb-token";
const PENDING_RUNS_KEY = "rune-survivors-stdb-pending-runs";
const PKCE_VERIFIER_KEY = "rune-survivors-stdb-pkce-verifier";
const PKCE_STATE_KEY = "rune-survivors-stdb-pkce-state";

const DEFAULT_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? "ws://localhost:3000";
const DEFAULT_DB = import.meta.env.VITE_SPACETIMEDB_DB ?? "rune-survivors";
const AUTH_ISSUER = import.meta.env.VITE_SPACETIMEAUTH_ISSUER ?? "https://auth.spacetimedb.com/oidc";
const AUTH_CLIENT_ID = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID ?? "";

export type CloudSyncStatus = "disabled" | "connecting" | "connected" | "error";

export type EndlessLeaderboardEntry = {
    id: string;
    mapId: string;
    identityHex: string;
    isSelf: boolean;
    displayName: string;
    characterId: string;
    round: number;
    seconds: number;
    level: number;
    kills: number;
    coins: number;
};

export type StandardLeaderboardEntry = {
    id: string;
    mapId: string;
    identityHex: string;
    isSelf: boolean;
    displayName: string;
    characterId: string;
    victory: boolean;
    seconds: number;
    level: number;
    kills: number;
    coins: number;
    score: number;
};

export type AuthzRoleEntry = {
    id: string;
    name: string;
    permissions: string[];
    effective: string[];
    system: boolean;
};

export type AuthzScopeEntry = {
    id: string;
    parent: string;
    kind: string;
    name: string;
};

export type AuthzGrantEntry = {
    id: string;
    identityHex: string;
    roleId: string;
    roleName: string;
    scopeId: string;
    expiresAt?: number;
};

export type CloudState = {
    isLoggedIn: boolean;
    status: CloudSyncStatus;
    identityHex?: string;
    displayName?: string;
    hasOidcClient: boolean;
    pendingRuns: number;
    error?: string;
    isAdmin: boolean;
    roles: string[];
    permissions: string[];
    authzRoles: AuthzRoleEntry[];
    authzScopes: AuthzScopeEntry[];
    authzGrants: AuthzGrantEntry[];
    endlessLeaderboard: EndlessLeaderboardEntry[];
    standardLeaderboard: StandardLeaderboardEntry[];
};

export function toSavePayload(save: SaveData): SavePayload {
    return {
        coins: BigInt(Math.max(0, Math.floor(save.coins))),
        totalCoins: BigInt(Math.max(0, Math.floor(save.totalCoins))),
        upgrades: Object.entries(save.upgrades)
            .filter(([, rank]) => rank > 0)
            .map(([id, rank]) => ({ id, rank })),
        upgradesSpent: BigInt(Math.max(0, Math.floor(save.upgradesSpent))),
        unlockedCharacters: [...save.unlockedCharacters],
        unlockedItems: [...save.unlockedItems],
        runs: save.runs,
        victories: save.victories,
        mapVictories: Object.entries(save.mapVictories)
            .filter(([, count]) => count > 0)
            .map(([id, count]) => ({ id, count })),
        totalKills: BigInt(Math.max(0, Math.floor(save.totalKills))),
        bestSeconds: save.bestSeconds,
        bestLevel: save.bestLevel,
        endlessBest: Object.entries(save.endlessBest)
            .filter(([, rec]) => rec.round > 0)
            .map(([mapId, rec]) => ({ mapId, round: rec.round, seconds: rec.seconds })),
        foundGear: [...save.foundGear],
        armoury: Object.entries(save.armoury)
            .filter(([, rank]) => rank > 0)
            .map(([id, rank]) => ({ id, rank })),
    };
}

export function fromPlayerSave(row: PlayerSave): SaveData {
    const upgrades: Record<string, number> = {};
    for (const entry of row.upgrades) {
        upgrades[entry.id] = entry.rank;
    }
    const mapVictories: Record<string, number> = {};
    for (const entry of row.mapVictories) {
        mapVictories[entry.id] = entry.count;
    }
    const endlessBest: Record<string, EndlessRecord> = {};
    for (const entry of row.endlessBest) {
        endlessBest[entry.mapId] = { round: entry.round, seconds: entry.seconds };
    }
    const armoury: Record<string, number> = {};
    for (const entry of row.armoury) {
        armoury[entry.id] = entry.rank;
    }
    return migrateSave({
        coins: Number(row.coins),
        totalCoins: Number(row.totalCoins),
        upgrades,
        upgradesSpent: Number(row.upgradesSpent),
        unlockedCharacters: [...row.unlockedCharacters],
        unlockedItems: [...row.unlockedItems],
        runs: row.runs,
        victories: row.victories,
        mapVictories,
        totalKills: Number(row.totalKills),
        bestSeconds: row.bestSeconds,
        bestLevel: row.bestLevel,
        endlessBest,
        foundGear: [...row.foundGear],
        armoury,
    });
}

export function toRunSubmission(run: RunResult): RunSubmission {
    return {
        mapId: run.mapId,
        characterId: run.characterId,
        seed: run.seed,
        endless: run.endless,
        round: run.round,
        victory: run.victory,
        seconds: run.seconds,
        ticks: run.ticks,
        level: run.level,
        xp: BigInt(Math.max(0, Math.floor(run.xp))),
        kills: run.kills,
        coins: run.coins,
        casketsOpened: run.casketsOpened,
        bossesKilled: [...run.bossesKilled],
        bossKillTicks: [...run.bossKillTicks],
        gearFound: [...run.gearFound],
    };
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomUrlSafeString(byteLength = 32): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(digest));
}

function extractJwtDisplayName(jwt: string): string | undefined {
    try {
        const parts = jwt.split(".");
        if (parts.length < 2) {
            return undefined;
        }
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const claims = JSON.parse(payloadJson) as Record<string, unknown>;
        const raw =
            (typeof claims.preferred_username === "string" && claims.preferred_username) ||
            (typeof claims.nickname === "string" && claims.nickname) ||
            (typeof claims.name === "string" && claims.name);
        if (!raw) {
            return undefined;
        }
        const cleaned = raw
            .replace(/[^A-Za-z0-9 _-]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 12);
        return validateDisplayName(cleaned).valid ? cleaned : undefined;
    } catch {
        return undefined;
    }
}

export class SpacetimeSync {
    private conn?: DbConnection;
    private syncTimer?: ReturnType<typeof setTimeout>;
    private state: CloudState;
    private readonly getLocalSave: () => SaveData;
    private readonly onMergedSave: (save: SaveData) => void;
    private readonly onStateChange: (state: CloudState) => void;

    constructor(options: {
        getLocalSave: () => SaveData;
        onMergedSave: (save: SaveData) => void;
        onStateChange: (state: CloudState) => void;
    }) {
        this.getLocalSave = options.getLocalSave;
        this.onMergedSave = options.onMergedSave;
        this.onStateChange = options.onStateChange;
        const storedToken = this.getStoredToken();
        const isLoggedIn = Boolean(storedToken);
        this.state = {
            isLoggedIn,
            status: isLoggedIn ? "connecting" : "disabled",
            hasOidcClient: AUTH_CLIENT_ID.length > 0,
            pendingRuns: this.loadPendingRuns().length,
            isAdmin: false,
            roles: [],
            permissions: [],
            authzRoles: [],
            authzScopes: [],
            authzGrants: [],
            endlessLeaderboard: [],
            standardLeaderboard: [],
        };
    }

    getSnapshot(): CloudState {
        return this.state;
    }

    async init(): Promise<void> {
        await this.handleAuthCallbackIfPresent();
        if (this.state.isLoggedIn) {
            this.connect();
        } else {
            this.emitState({});
        }
    }

    dispose(): void {
        if (this.syncTimer !== undefined) {
            clearTimeout(this.syncTimer);
            this.syncTimer = undefined;
        }
        this.conn?.disconnect();
        this.conn = undefined;
    }

    /**
     * Initiates SpacetimeAuth OIDC PKCE login when `VITE_SPACETIMEAUTH_CLIENT_ID` is configured,
     * or connects directly with SpacetimeDB token identity on local/custom servers.
     */
    async signInWithSpacetimeAuth(): Promise<void> {
        if (AUTH_CLIENT_ID) {
            const verifier = randomUrlSafeString(32);
            const challenge = await sha256Base64Url(verifier);
            const state = randomUrlSafeString(16);
            try {
                window.sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
                window.sessionStorage.setItem(PKCE_STATE_KEY, state);
            } catch {}
            const redirectUri = window.location.origin + window.location.pathname;
            const url = new URL(`${AUTH_ISSUER.replace(/\/$/, "")}/auth`);
            url.searchParams.set("client_id", AUTH_CLIENT_ID);
            url.searchParams.set("redirect_uri", redirectUri);
            url.searchParams.set("response_type", "code");
            url.searchParams.set("scope", "openid profile email");
            url.searchParams.set("code_challenge", challenge);
            url.searchParams.set("code_challenge_method", "S256");
            url.searchParams.set("state", state);
            window.location.assign(url.toString());
            return;
        }
        // Local development mode without configured OIDC client:
        this.loginWithToken();
    }

    loginWithToken(customToken?: string): void {
        const token = customToken?.trim();
        if (token) {
            try {
                window.localStorage.setItem(TOKEN_KEY, token);
            } catch {}
        }
        this.state.isLoggedIn = true;
        this.connect();
    }

    logout(): void {
        try {
            window.localStorage.removeItem(TOKEN_KEY);
        } catch {}
        if (this.syncTimer !== undefined) {
            clearTimeout(this.syncTimer);
            this.syncTimer = undefined;
        }
        this.conn?.disconnect();
        this.conn = undefined;
        this.emitState({
            isLoggedIn: false,
            status: "disabled",
            error: undefined,
            identityHex: undefined,
            displayName: undefined,
            isAdmin: false,
            roles: [],
            permissions: [],
            authzRoles: [],
            authzScopes: [],
            authzGrants: [],
            endlessLeaderboard: [],
            standardLeaderboard: [],
        });
    }

    getStoredToken(): string | undefined {
        try {
            const token = window.localStorage.getItem(TOKEN_KEY);
            return token && token.trim() ? token.trim() : undefined;
        } catch {
            return undefined;
        }
    }

    async setDisplayName(name: string): Promise<string | undefined> {
        if (!this.state.isLoggedIn) {
            return "Please log in to change your display name.";
        }
        const check = validateDisplayName(name);
        if (!check.valid) {
            return check.reason;
        }
        if (!this.conn || !this.conn.isActive) {
            return "Not connected to SpacetimeDB.";
        }
        try {
            await this.conn.reducers.setDisplayName({ displayName: name.trim() });
            return undefined;
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /**
     * Authz administration helpers.
     */
    async grantRole(targetIdentityHex: string, roleId: string | bigint | number, scopeId = 0n): Promise<string | undefined> {
        if (!this.conn || !this.conn.isActive) {
            return "Not connected to SpacetimeDB.";
        }
        try {
            const identity = Identity.fromString(targetIdentityHex);
            await this.conn.reducers.authzGrantRole({
                identity,
                roleId: BigInt(roleId),
                scopeId: BigInt(scopeId),
                expiresAt: undefined,
            });
            return undefined;
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    async revokeGrant(grantId: string | bigint | number): Promise<string | undefined> {
        if (!this.conn || !this.conn.isActive) {
            return "Not connected to SpacetimeDB.";
        }
        try {
            await this.conn.reducers.authzRevokeGrant({
                grantId: BigInt(grantId),
            });
            return undefined;
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    async createScope(name: string, kind = "room", parent = 0n): Promise<string | undefined> {
        if (!this.conn || !this.conn.isActive) {
            return "Not connected to SpacetimeDB.";
        }
        try {
            await this.conn.reducers.authzCreateScope({
                parent: BigInt(parent),
                kind,
                name,
            });
            return undefined;
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /**
     * Queues and submits a finished run's stats after client-side anti-cheat verification.
     */
    submitRun(result: RunResult): VerificationResultSummary {
        const verification = verifyRunResult(result);
        if (!verification.valid) {
            return { verified: false, reason: verification.reason };
        }
        if (!this.state.isLoggedIn) {
            return { verified: true, synced: false };
        }
        this.enqueueRun(result);
        if (this.conn && this.conn.isActive) {
            void this.flushPendingRuns();
        }
        return { verified: true, synced: Boolean(this.conn?.isActive) };
    }

    /**
     * Debounces syncing non-run save mutations (Shop skill purchases, Armoury upgrades, refunds).
     */
    scheduleSaveSync(save: SaveData): void {
        if (!this.state.isLoggedIn || !this.conn || !this.conn.isActive) {
            return;
        }
        if (this.syncTimer !== undefined) {
            clearTimeout(this.syncTimer);
        }
        this.syncTimer = setTimeout(() => {
            this.syncTimer = undefined;
            if (this.conn && this.conn.isActive) {
                this.conn.reducers
                    .syncSave({ payload: toSavePayload(save) })
                    .catch((e) => console.error("Failed to sync save to SpacetimeDB", e));
            }
        }, 3500);
    }

    private async handleAuthCallbackIfPresent(): Promise<void> {
        if (typeof window === "undefined") {
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        if (!code || !state) {
            return;
        }
        let expectedState: string | null = null;
        let verifier: string | null = null;
        try {
            expectedState = window.sessionStorage.getItem(PKCE_STATE_KEY);
            verifier = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);
            window.sessionStorage.removeItem(PKCE_STATE_KEY);
            window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        } catch {}

        // Clean OAuth parameters from the URL bar
        params.delete("code");
        params.delete("state");
        params.delete("session_state");
        params.delete("iss");
        const cleanSearch = params.toString();
        const cleanUrl =
            window.location.pathname + (cleanSearch ? `?${cleanSearch}` : "") + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);

        if (!expectedState || state !== expectedState || !verifier || !AUTH_CLIENT_ID) {
            return;
        }

        try {
            const redirectUri = window.location.origin + window.location.pathname;
            const body = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: AUTH_CLIENT_ID,
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            });
            const response = await fetch(`${AUTH_ISSUER.replace(/\/$/, "")}/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: body.toString(),
            });
            if (!response.ok) {
                throw new Error(`SpacetimeAuth token exchange failed (${response.status})`);
            }
            const tokenData = (await response.json()) as { id_token?: string; access_token?: string };
            const token = tokenData.id_token ?? tokenData.access_token;
            if (!token) {
                throw new Error("SpacetimeAuth response did not include an id_token");
            }
            window.localStorage.setItem(TOKEN_KEY, token);
            this.state.isLoggedIn = true;
            this.connect();
        } catch (e) {
            console.error("SpacetimeAuth callback failed", e);
            this.emitState({
                isLoggedIn: false,
                status: "error",
                error: e instanceof Error ? e.message : "Authentication failed",
            });
        }
    }

    private connect(): void {
        if (!this.state.isLoggedIn) {
            this.conn?.disconnect();
            this.conn = undefined;
            this.emitState({
                isLoggedIn: false,
                status: "disabled",
                error: undefined,
            });
            return;
        }

        const token = this.getStoredToken();
        this.conn?.disconnect();

        this.emitState({
            isLoggedIn: true,
            status: "connecting",
            error: undefined,
        });

        try {
            const builder = DbConnection.builder()
                .withUri(DEFAULT_URI)
                .withDatabaseName(DEFAULT_DB)
                .withAutomaticReconnect()
                .onConnect((ctx, identity, issuedToken) => {
                    try {
                        window.localStorage.setItem(TOKEN_KEY, issuedToken);
                    } catch {}
                    const identityHex = identity.toHexString();
                    this.emitState({
                        isLoggedIn: true,
                        status: "connected",
                        identityHex,
                        error: undefined,
                    });
                    this.setupSubscriptions(ctx, issuedToken);
                })
                .onDisconnect(() => {
                    if (this.state.isLoggedIn) {
                        this.emitState({ status: "connecting" });
                    }
                })
                .onConnectError((_ctx: ErrorContext, err: Error) => {
                    // Stale or invalid token rejected with 401: clear it so subsequent attempts can connect cleanly
                    if (
                        err.message?.includes("401") ||
                        err.message?.toLowerCase().includes("unauthorized")
                    ) {
                        try {
                            window.localStorage.removeItem(TOKEN_KEY);
                        } catch {}
                    }
                    this.emitState({
                        status: "error",
                        error: err.message || "Could not connect to SpacetimeDB",
                    });
                });

            if (token) {
                builder.withToken(token);
            }

            this.conn = builder.build();
        } catch (e) {
            this.emitState({
                status: "error",
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    private setupSubscriptions(conn: DbConnection, token: string): void {
        const refreshTables = () => this.refreshFromCache(conn);
        conn.db.playerSave.onInsert((_ctx: EventContext, row: PlayerSave) => {
            if (conn.identity && row.identity.isEqual(conn.identity)) {
                this.reconcilePlayerSave(row);
            }
            refreshTables();
        });
        conn.db.playerSave.onUpdate((_ctx: EventContext, _oldRow: PlayerSave, row: PlayerSave) => {
            if (conn.identity && row.identity.isEqual(conn.identity)) {
                this.reconcilePlayerSave(row);
            }
            refreshTables();
        });

        conn.db.leaderboardEndless.onInsert(refreshTables);
        conn.db.leaderboardEndless.onUpdate(refreshTables);
        conn.db.leaderboardEndless.onDelete(refreshTables);

        conn.db.leaderboardStandard.onInsert(refreshTables);
        conn.db.leaderboardStandard.onUpdate(refreshTables);
        conn.db.leaderboardStandard.onDelete(refreshTables);

        conn.db.authzRole.onInsert(refreshTables);
        conn.db.authzRole.onUpdate(refreshTables);
        conn.db.authzRole.onDelete(refreshTables);

        conn.db.authzScope.onInsert(refreshTables);
        conn.db.authzScope.onUpdate(refreshTables);
        conn.db.authzScope.onDelete(refreshTables);

        conn.db.authzGrant.onInsert(refreshTables);
        conn.db.authzGrant.onUpdate(refreshTables);
        conn.db.authzGrant.onDelete(refreshTables);

        conn.subscriptionBuilder()
            .onApplied(() => {
                const myIdentity = conn.identity;
                if (myIdentity) {
                    const existing = conn.db.playerSave.identity.find(myIdentity);
                    if (existing) {
                        this.reconcilePlayerSave(existing, true);
                    } else {
                        // First time connecting this identity: push local save & JWT username if any
                        const claimName = extractJwtDisplayName(token);
                        if (claimName) {
                            conn.reducers.setDisplayName({ displayName: claimName }).catch(() => {});
                        }
                        conn.reducers
                            .syncSave({ payload: toSavePayload(this.getLocalSave()) })
                            .catch((e) => console.error("Initial syncSave failed", e));
                    }
                }
                this.refreshFromCache(conn);
                void this.flushPendingRuns();
            })
            .subscribe([
                "SELECT * FROM player_save",
                "SELECT * FROM leaderboard_endless",
                "SELECT * FROM leaderboard_standard",
                "SELECT * FROM authz_role",
                "SELECT * FROM authz_scope",
                "SELECT * FROM authz_grant",
            ]);
    }

    private reconcilePlayerSave(row: PlayerSave, pushMergedBack = false): void {
        const remoteSave = fromPlayerSave(row);
        const localSave = this.getLocalSave();
        const merged = mergeSaves(localSave, remoteSave);
        if (JSON.stringify(merged) !== JSON.stringify(localSave)) {
            this.onMergedSave(merged);
        }
        if (pushMergedBack && JSON.stringify(merged) !== JSON.stringify(remoteSave)) {
            this.conn?.reducers
                .syncSave({ payload: toSavePayload(merged) })
                .catch((e) => console.error("Failed to push merged save", e));
        }
        this.emitState({ displayName: row.displayName });
    }

    private refreshFromCache(conn: DbConnection): void {
        const myIdentity = conn.identity;
        const myProfile = myIdentity ? conn.db.playerSave.identity.find(myIdentity) : undefined;

        // Roles & Grants lookup
        const rolesById = new Map<string, AuthzRole>();
        const authzRoles: AuthzRoleEntry[] = [];
        for (const role of conn.db.authzRole.iter()) {
            rolesById.set(String(role.id), role);
            authzRoles.push({
                id: String(role.id),
                name: role.name,
                permissions: [...role.permissions],
                effective: [...role.effective],
                system: role.system,
            });
        }

        const authzScopes: AuthzScopeEntry[] = [];
        for (const scope of conn.db.authzScope.iter()) {
            authzScopes.push({
                id: String(scope.id),
                parent: String(scope.parent),
                kind: scope.kind,
                name: scope.name,
            });
        }

        const authzGrants: AuthzGrantEntry[] = [];
        const myRoles: string[] = [];
        const myPermissions = new Set<string>();

        for (const grant of conn.db.authzGrant.iter()) {
            const role = rolesById.get(String(grant.roleId));
            const roleName = role ? role.name : `Role #${grant.roleId}`;
            authzGrants.push({
                id: String(grant.id),
                identityHex: grant.identity.toHexString(),
                roleId: String(grant.roleId),
                roleName,
                scopeId: String(grant.scopeId),
                expiresAt: grant.expiresAt ? Number(grant.expiresAt.microsSinceEpoch / 1000n) : undefined,
            });

            if (myIdentity && grant.identity.isEqual(myIdentity)) {
                if (role) {
                    myRoles.push(role.name);
                    for (const p of role.effective) {
                        myPermissions.add(p);
                    }
                }
            }
        }

        const isAdmin =
            myPermissions.has("*") ||
            myPermissions.has("admin") ||
            myRoles.includes("owner") ||
            myRoles.includes("admin");

        const endlessRows: EndlessLeaderboardEntry[] = Array.from(
            conn.db.leaderboardEndless.iter(),
        ).map((row: LeaderboardEndless) => ({
            id: String(row.id),
            mapId: row.mapId,
            identityHex: row.identity.toHexString(),
            isSelf: myIdentity ? row.identity.isEqual(myIdentity) : false,
            displayName: row.displayName,
            characterId: row.characterId,
            round: row.round,
            seconds: row.seconds,
            level: row.level,
            kills: row.kills,
            coins: row.coins,
        }));
        endlessRows.sort(
            (a, b) => b.round - a.round || b.seconds - a.seconds || b.kills - a.kills,
        );

        const standardRows: StandardLeaderboardEntry[] = Array.from(
            conn.db.leaderboardStandard.iter(),
        ).map((row: LeaderboardStandard) => ({
            id: String(row.id),
            mapId: row.mapId,
            identityHex: row.identity.toHexString(),
            isSelf: myIdentity ? row.identity.isEqual(myIdentity) : false,
            displayName: row.displayName,
            characterId: row.characterId,
            victory: row.victory,
            seconds: row.seconds,
            level: row.level,
            kills: row.kills,
            coins: row.coins,
            score: Number(row.score),
        }));
        standardRows.sort(
            (a, b) =>
                Number(b.victory) - Number(a.victory) ||
                b.score - a.score ||
                b.seconds - a.seconds,
        );

        this.emitState({
            displayName: myProfile?.displayName ?? this.state.displayName,
            isAdmin,
            roles: myRoles,
            permissions: Array.from(myPermissions),
            authzRoles,
            authzScopes,
            authzGrants,
            endlessLeaderboard: endlessRows,
            standardLeaderboard: standardRows,
        });
    }

    private loadPendingRuns(): RunResult[] {
        try {
            const raw = window.localStorage.getItem(PENDING_RUNS_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private savePendingRuns(runs: RunResult[]): void {
        try {
            if (runs.length === 0) {
                window.localStorage.removeItem(PENDING_RUNS_KEY);
            } else {
                window.localStorage.setItem(PENDING_RUNS_KEY, JSON.stringify(runs.slice(-25)));
            }
        } catch {}
        this.emitState({ pendingRuns: runs.length });
    }

    private enqueueRun(run: RunResult): void {
        const pending = this.loadPendingRuns();
        pending.push(run);
        this.savePendingRuns(pending);
    }

    private async flushPendingRuns(): Promise<void> {
        if (!this.conn || !this.conn.isActive) {
            return;
        }
        const pending = this.loadPendingRuns();
        if (pending.length === 0) {
            return;
        }
        const remaining: RunResult[] = [];
        for (const run of pending) {
            if (!verifyRunResult(run).valid) {
                continue;
            }
            try {
                await this.conn.reducers.submitRun({ run: toRunSubmission(run) });
            } catch (e) {
                console.error("Failed to submit queued run to SpacetimeDB", e);
                remaining.push(run);
            }
        }
        this.savePendingRuns(remaining);
    }

    private emitState(changes: Partial<CloudState>): void {
        this.state = { ...this.state, ...changes };
        this.onStateChange(this.state);
    }
}

export type VerificationResultSummary =
    | { verified: true; synced: boolean }
    | { verified: false; reason: string };
