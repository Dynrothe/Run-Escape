# SpacetimeDB & SpacetimeAuth Setup

Run Escape uses [SpacetimeDB](https://spacetimedb.com/) for cloud persistence and hiscores, [SpacetimeAuth](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/) for identity and authentication, and `@pogly/spacetimedb-authz` for role-based access control (admin, moderator, player).

All SpacetimeDB connections are behind a login wall: the game runs completely client-side in local mode by default, and only initiates a WebSocket connection when the player logs in.

---

## 1. Local Development Setup

### Prerequisites
- [SpacetimeDB CLI](https://spacetimedb.com/install) installed (`curl -sSf https://install.spacetimedb.com | sh`)
- Rust toolchain with `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)

### Running Locally

1. **Start the local SpacetimeDB server** (in terminal 1):
   ```bash
   spacetime start
   ```

2. **Publish the server module** (in terminal 2):
   ```bash
   npm run stdb:publish
   ```
   *This compiles `server/` to WebAssembly, initializes default roles (`player`, `moderator`, `admin`), applies row-level security (RLS), and registers your CLI identity as database Owner.*

3. **Start the web client** (in terminal 3):
   ```bash
   npm start
   ```
   Open `http://localhost:5173`.

4. **Log in locally**:
   - Go to **Settings > Cloud Sync (SpacetimeDB)**.
   - Click **Log In**. In local development, SpacetimeDB automatically mints a local signed token and persistent identity.

5. **Grant Admin to your browser identity**:
   To test the in-game **Authz Admin** panel in Hiscores:
   ```bash
   spacetime call --server local rune-survivors authz_grant_role '"0x<YOUR_BROWSER_IDENTITY_HEX>"' 4 0 '[1, []]'
   ```

---

## 2. Connecting OAuth Providers (SpacetimeAuth)

SpacetimeDB acts as an OIDC Identity Broker and supports **GitHub**, **Discord**, **Google**, **Twitch**, and **Kick**.

### Step 1: Create an OAuth App with your provider

Set the **Authorization callback URL** in your provider's developer console to:
```text
https://auth.spacetimedb.com/oidc/callback
```
*(Or your self-hosted SpacetimeDB server callback endpoint).*

### Step 2: Enable the Identity Provider in SpacetimeDB

In your terminal, configure the provider credentials for your database:

```bash
# GitHub
spacetime auth idp set rune-survivors github <CLIENT_ID> <CLIENT_SECRET>

# Discord
spacetime auth idp set rune-survivors discord <CLIENT_ID> <CLIENT_SECRET>

# Google
spacetime auth idp set rune-survivors google <CLIENT_ID> <CLIENT_SECRET>
```

### Step 3: Create the OAuth Client for the Web App

Create a public PKCE OAuth client:

```bash
spacetime auth client create rune-survivors --name "Run Escape Web"
```
Copy the generated client ID (e.g. `client_01j7...`).

Configure the allowed redirect URIs for your web deployments:
```bash
spacetime auth client set rune-survivors redirect_uris "http://localhost:5173,https://yourdomain.com"
```

### Step 4: Set Environment Variables

Create `.env.local` in the project root:

```env
# Required for SpacetimeAuth PKCE login redirect
VITE_SPACETIMEAUTH_CLIENT_ID=client_01j7...

# Optional overrides (defaults to local standalone instance)
VITE_SPACETIMEDB_URI=ws://localhost:3000
VITE_SPACETIMEDB_DB=rune-survivors
VITE_SPACETIMEAUTH_ISSUER=https://auth.spacetimedb.com/oidc
```

When `VITE_SPACETIMEAUTH_CLIENT_ID` is set, clicking **Sign In** in the game redirects to SpacetimeAuth's hosted provider selection screen, and returns the player with their authenticated OIDC display name and persistent SpacetimeDB identity.

---

## 3. Architecture & Anti-Cheat

### Energy Optimization
To keep SpacetimeDB compute energy as cheap as possible:
- **Single-call verification**: No extra `start_run` reducer invocations. Runs are verified in a single `submit_run` call.
- **Timestamp Delta**: Wall-clock time on the server (`ctx.timestamp - last_run_at`) is verified against the claimed run seconds, preventing speed-hacking and bulk-submission scripts.
- **$O(1)$ Arithmetic Checks**: Enforces hard physics limits (maximum plausible kills/second, coins/second, boss earliest spawn ticks, and OSRS XP curve bounds).
- **Selective Writes**: Leaderboard rows (`leaderboard_standard` and `leaderboard_endless`) are only inserted or updated if the run achieves a new personal best.
- **Row-Level Security (RLS)**: Client visibility filter `PLAYER_SAVE_OWNER` ensures players only receive WebSocket push updates for their own save data.

---

## 4. Useful CLI Commands

```bash
# Query the active leaderboard
spacetime sql --server local rune-survivors "SELECT * FROM leaderboard_standard ORDER BY score DESC LIMIT 10"

# List all connected players
spacetime sql --server local rune-survivors "SELECT identity, display_name FROM player_save"

# View role grants
spacetime sql --server local rune-survivors "SELECT * FROM authz_grant"

# Re-generate TypeScript bindings after modifying server/src/lib.rs
npm run stdb:generate
```
