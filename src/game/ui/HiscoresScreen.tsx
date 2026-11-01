import { CSSProperties, FormEvent, useEffect, useState } from "react";

import { GameClient } from "../client/GameClient";
import { UiSnapshot } from "../client/GameStore";
import { formatTime } from "../client/GameView";
import { getCharacter } from "../content/characters";
import { FUN_MAPS, MAPS, getMap } from "../content/maps";
import { validateDisplayName } from "../spacetimedb/anticheat";
import { Coins } from "./Coins";
import "./HiscoresScreen.css";
import { ItemIcon } from "./ItemIcon";

type Props = { ui: UiSnapshot; client: GameClient };

type BoardMode = "endless" | "standard";

const ALL_MAPS = [...MAPS, ...FUN_MAPS];

export function HiscoresScreen({ ui, client }: Props): JSX.Element {
    const cloud = ui.cloud;
    const [selectedMapId, setSelectedMapId] = useState(ui.mapId || MAPS[0].id);
    const selectedMap = getMap(selectedMapId);
    const [mode, setMode] = useState<BoardMode>(selectedMap.fun ? "endless" : "endless");

    const [nameInput, setNameInput] = useState(cloud.displayName ?? "");
    const [nameBusy, setNameBusy] = useState(false);
    const [nameFeedback, setNameFeedback] = useState<{ text: string; error: boolean }>();

    // Authz admin panel state
    const [grantTargetHex, setGrantTargetHex] = useState("");
    const [grantRoleId, setGrantRoleId] = useState("1");
    const [grantFeedback, setGrantFeedback] = useState<string>();
    const [showAdminPanel, setShowAdminPanel] = useState(false);

    useEffect(() => {
        if (cloud.displayName && !nameInput) {
            setNameInput(cloud.displayName);
        }
    }, [cloud.displayName, nameInput]);

    // Fun maps are always endless
    const effectiveMode: BoardMode = selectedMap.fun ? "endless" : mode;

    const endlessEntries = cloud.endlessLeaderboard.filter((e) => e.mapId === selectedMapId);
    const standardEntries = cloud.standardLeaderboard.filter((e) => e.mapId === selectedMapId);

    const syncAriaInvalid = (input: HTMLInputElement) => {
        const check = validateDisplayName(input.value);
        input.setCustomValidity(check.valid ? "" : check.reason);
        input.setAttribute("aria-invalid", String(!input.validity.valid));
    };

    const onSubmitDisplayName = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const check = validateDisplayName(nameInput);
        if (!check.valid) {
            setNameFeedback({ text: check.reason, error: true });
            return;
        }
        setNameBusy(true);
        setNameFeedback(undefined);
        const err = await client.setCloudDisplayName(nameInput);
        setNameBusy(false);
        if (err) {
            setNameFeedback({ text: err, error: true });
        } else {
            setNameFeedback({ text: "Display name updated!", error: false });
        }
    };

    const tableLabelsStyle = (
        effectiveMode === "endless"
            ? {
                  "--label-2": '"Adventurer"',
                  "--label-3": '"Round"',
                  "--label-4": '"Survived"',
                  "--label-5": '"Level"',
                  "--label-6": '"Kills"',
                  "--label-7": '"Coins"',
              }
            : {
                  "--label-2": '"Adventurer"',
                  "--label-3": '"Result"',
                  "--label-4": '"Score"',
                  "--label-5": '"Time"',
                  "--label-6": '"Level"',
                  "--label-7": '"Kills"',
              }
    ) as CSSProperties;

    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-hiscores">
                <h2>Hiscores</h2>
                <p className="ui-subtle">
                    Post-run verified records synced via SpacetimeDB. Only completed runs that pass
                    timeline and loot verification are recorded.
                </p>

                <div className="ui-hiscores-banner">
                    <div className="ui-hiscores-status">
                        <span
                            className={
                                "ui-status-dot ui-status-" +
                                (cloud.status === "connected"
                                    ? "connected"
                                    : cloud.status === "connecting"
                                      ? "connecting"
                                      : cloud.status === "error"
                                        ? "error"
                                        : "disabled")
                            }
                        />
                        <span>
                            {cloud.status === "connected"
                                ? `Connected as ${cloud.displayName ?? "Adventurer"}${cloud.roles.length > 0 ? ` [${cloud.roles.join(", ")}]` : ""}`
                                : cloud.status === "connecting"
                                  ? "Connecting to SpacetimeDB..."
                                  : cloud.status === "error"
                                    ? `Sync error: ${cloud.error ?? "Unavailable"}`
                                    : "Login required (offline mode)"}
                        </span>
                        {cloud.pendingRuns > 0 && (
                            <span className="ui-hiscores-pending">
                                ({cloud.pendingRuns} queued)
                            </span>
                        )}
                    </div>

                    {!cloud.isLoggedIn ? (
                        <div className="ui-hiscores-actions">
                            <button
                                className="ui-button ui-button-small ui-button-go"
                                onClick={() => client.signInCloud()}
                            >
                                {cloud.hasOidcClient
                                    ? "Sign in with SpacetimeAuth"
                                    : "Log In via SpacetimeAuth"}
                            </button>
                        </div>
                    ) : (
                        cloud.status === "connected" && (
                            <form className="ui-rsn-form" onSubmit={onSubmitDisplayName}>
                                <div className="ui-rsn-field">
                                    <label htmlFor="rsn-input" className="ui-rsn-label">
                                        Display name
                                    </label>
                                    <span id="rsn-hint" className="ui-rsn-hint">
                                        1–12 characters: letters, numbers, spaces, hyphens, or
                                        underscores.
                                    </span>
                                    <div className="ui-rsn-input-row">
                                        <input
                                            id="rsn-input"
                                            className="ui-rsn-input"
                                            type="text"
                                            required
                                            minLength={1}
                                            maxLength={12}
                                            pattern="^(?!.*  )[A-Za-z0-9 _\-]{1,12}$"
                                            aria-describedby="rsn-hint rsn-feedback"
                                            value={nameInput}
                                            placeholder={cloud.displayName ?? "Adventurer"}
                                            onChange={(e) => setNameInput(e.target.value)}
                                            onBlur={(e) => syncAriaInvalid(e.currentTarget)}
                                            onInput={(e) => {
                                                if (
                                                    e.currentTarget.getAttribute("aria-invalid") ===
                                                    "true"
                                                ) {
                                                    syncAriaInvalid(e.currentTarget);
                                                }
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            className="ui-button ui-button-small"
                                            disabled={nameBusy}
                                        >
                                            {nameBusy ? "Saving..." : "Set name"}
                                        </button>
                                    </div>
                                    {nameFeedback && (
                                        <span
                                            id="rsn-feedback"
                                            className={
                                                nameFeedback.error
                                                    ? "ui-rsn-feedback ui-rsn-feedback-error"
                                                    : "ui-rsn-feedback ui-rsn-feedback-ok"
                                            }
                                            role={nameFeedback.error ? "alert" : "status"}
                                        >
                                            {nameFeedback.text}
                                        </span>
                                    )}
                                </div>
                            </form>
                        )
                    )}
                </div>

                <div className="ui-hiscores-controls">
                    <div className="ui-hiscores-maps" role="tablist" aria-label="Map">
                        {ALL_MAPS.map((map) => {
                            const active = map.id === selectedMapId;
                            return (
                                <button
                                    key={map.id}
                                    role="tab"
                                    aria-selected={active}
                                    className={
                                        "ui-card ui-hiscores-map-tab" +
                                        (active ? " ui-card-selected" : "")
                                    }
                                    onClick={() => setSelectedMapId(map.id)}
                                >
                                    <ItemIcon objId={map.iconObjId} size={20} />
                                    <span>{map.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {!selectedMap.fun && (
                        <div className="ui-hiscores-modes">
                            <button
                                className={
                                    "ui-button ui-button-small" +
                                    (effectiveMode === "endless" ? " ui-button-active" : "")
                                }
                                aria-pressed={effectiveMode === "endless"}
                                onClick={() => setMode("endless")}
                            >
                                Endless
                            </button>
                            <button
                                className={
                                    "ui-button ui-button-small" +
                                    (effectiveMode === "standard" ? " ui-button-active" : "")
                                }
                                aria-pressed={effectiveMode === "standard"}
                                onClick={() => setMode("standard")}
                            >
                                Standard (15m)
                            </button>
                        </div>
                    )}
                </div>

                <div
                    tabIndex={0}
                    role="region"
                    aria-labelledby="hiscores-table-caption"
                    className="ui-hiscores-table-wrapper"
                    style={tableLabelsStyle}
                >
                    <table className="ui-hiscores-table">
                        <caption id="hiscores-table-caption" className="ui-hiscores-caption">
                            {selectedMap.name} —{" "}
                            {effectiveMode === "endless"
                                ? "Endless Survival Hiscores"
                                : "Standard Run Hiscores"}
                        </caption>
                        <thead>
                            {effectiveMode === "endless" ? (
                                <tr>
                                    <th scope="col">Rank &amp; Player</th>
                                    <th scope="col">Adventurer</th>
                                    <th scope="col">Round</th>
                                    <th scope="col">Survived</th>
                                    <th scope="col">Level</th>
                                    <th scope="col">Kills</th>
                                    <th scope="col">Coins</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th scope="col">Rank &amp; Player</th>
                                    <th scope="col">Adventurer</th>
                                    <th scope="col">Result</th>
                                    <th scope="col">Score</th>
                                    <th scope="col">Time</th>
                                    <th scope="col">Level</th>
                                    <th scope="col">Kills</th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {effectiveMode === "endless" ? (
                                endlessEntries.length === 0 ? (
                                    <tr className="ui-hiscores-empty-row">
                                        <td colSpan={7} className="ui-hiscores-empty">
                                            {cloud.isLoggedIn
                                                ? `No endless records recorded for ${selectedMap.name} yet.`
                                                : "Log in via SpacetimeAuth to access live global hiscores."}
                                        </td>
                                    </tr>
                                ) : (
                                    endlessEntries.map((entry, idx) => (
                                        <tr
                                            key={entry.id}
                                            className={entry.isSelf ? "ui-hiscores-self" : undefined}
                                        >
                                            <th scope="row">
                                                <span className="ui-hiscores-rank">#{idx + 1}</span>{" "}
                                                <span className="ui-hiscores-player">
                                                    {entry.displayName}
                                                </span>
                                            </th>
                                            <td>{getCharacter(entry.characterId).name}</td>
                                            <td className="ui-hiscores-num">Round {entry.round}</td>
                                            <td className="ui-hiscores-num">
                                                {formatTime(entry.seconds)}
                                            </td>
                                            <td className="ui-hiscores-num">{entry.level}</td>
                                            <td className="ui-hiscores-num">
                                                {entry.kills.toLocaleString()}
                                            </td>
                                            <td className="ui-hiscores-num">
                                                <Coins amount={entry.coins} />
                                            </td>
                                        </tr>
                                    ))
                                )
                            ) : standardEntries.length === 0 ? (
                                <tr className="ui-hiscores-empty-row">
                                    <td colSpan={7} className="ui-hiscores-empty">
                                        {cloud.isLoggedIn
                                            ? `No standard records recorded for ${selectedMap.name} yet.`
                                            : "Log in via SpacetimeAuth to access live global hiscores."}
                                    </td>
                                </tr>
                            ) : (
                                standardEntries.map((entry, idx) => (
                                    <tr
                                        key={entry.id}
                                        className={entry.isSelf ? "ui-hiscores-self" : undefined}
                                    >
                                        <th scope="row">
                                            <span className="ui-hiscores-rank">#{idx + 1}</span>{" "}
                                            <span className="ui-hiscores-player">
                                                {entry.displayName}
                                            </span>
                                        </th>
                                        <td>{getCharacter(entry.characterId).name}</td>
                                        <td>
                                            <span
                                                className={
                                                    entry.victory
                                                        ? "ui-hiscores-win"
                                                        : "ui-hiscores-fall"
                                                }
                                            >
                                                {entry.victory ? "Victory" : "Fallen"}
                                            </span>
                                        </td>
                                        <td className="ui-hiscores-num">
                                            {entry.score.toLocaleString()}
                                        </td>
                                        <td className="ui-hiscores-num">
                                            {formatTime(entry.seconds)}
                                        </td>
                                        <td className="ui-hiscores-num">{entry.level}</td>
                                        <td className="ui-hiscores-num">
                                            {entry.kills.toLocaleString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        Back
                    </button>
                    {cloud.isAdmin && (
                        <button
                            className="ui-button ui-button-small"
                            onClick={() => setShowAdminPanel(!showAdminPanel)}
                        >
                            {showAdminPanel ? "Hide Authz Admin" : "Authz Admin"}
                        </button>
                    )}
                    {ui.save.endlessBest[selectedMapId] && (
                        <span className="ui-subtle">
                            Your local endless best on {selectedMap.name}: Round{" "}
                            {ui.save.endlessBest[selectedMapId].round} (
                            {formatTime(ui.save.endlessBest[selectedMapId].seconds)})
                        </span>
                    )}
                </div>

                {cloud.isAdmin && showAdminPanel && (
                    <div className="ui-authz-admin rs-border">
                        <h3 className="ui-authz-heading">SpacetimeDB Authz Permissions &amp; Roles</h3>
                        <p className="ui-subtle">
                            Scoped authorization powered by <code>@pogly/spacetimedb-authz</code>.
                        </p>

                        <div className="ui-authz-grid">
                            <div className="ui-authz-section">
                                <h4>Available Roles</h4>
                                <ul className="ui-authz-list">
                                    {cloud.authzRoles.map((r) => (
                                        <li key={r.id}>
                                            <strong>{r.name}</strong> (id: {r.id}) — {r.effective.join(", ") || "none"}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="ui-authz-section">
                                <h4>Grant Role</h4>
                                <form
                                    className="ui-authz-grant-form"
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!grantTargetHex.trim()) return;
                                        setGrantFeedback("Granting...");
                                        const err = await client.grantRole(grantTargetHex.trim(), grantRoleId);
                                        setGrantFeedback(err ? `Error: ${err}` : "Role granted successfully!");
                                    }}
                                >
                                    <input
                                        className="ui-rsn-input"
                                        placeholder="Target Identity Hex"
                                        value={grantTargetHex}
                                        onChange={(e) => setGrantTargetHex(e.target.value)}
                                        required
                                    />
                                    <select
                                        className="ui-rsn-input"
                                        value={grantRoleId}
                                        onChange={(e) => setGrantRoleId(e.target.value)}
                                    >
                                        {cloud.authzRoles.map((r) => (
                                            <option key={r.id} value={r.id}>
                                                {r.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="submit" className="ui-button ui-button-small ui-button-go">
                                        Grant
                                    </button>
                                </form>
                                {grantFeedback && <span className="ui-rsn-feedback">{grantFeedback}</span>}
                            </div>
                        </div>

                        <div className="ui-authz-section" style={{ marginTop: 8 }}>
                            <h4>Active Grants</h4>
                            <div className="ui-authz-table-scroll">
                                <table className="ui-hiscores-table">
                                    <thead>
                                        <tr>
                                            <th>Role</th>
                                            <th>Identity</th>
                                            <th>Scope</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cloud.authzGrants.map((g) => (
                                            <tr key={g.id}>
                                                <td>{g.roleName}</td>
                                                <td><code>{g.identityHex.slice(0, 16)}...</code></td>
                                                <td>{g.scopeId === "0" ? "Global (0)" : g.scopeId}</td>
                                                <td>
                                                    <button
                                                        className="ui-button ui-button-small"
                                                        onClick={() => client.revokeGrant(g.id)}
                                                    >
                                                        Revoke
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
