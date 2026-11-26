// @vitest-environment jsdom
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { GameClient } from "../client/GameClient";
import { GameStore } from "../client/GameStore";
import { DAILY_COUNT, WEEKLY_COUNT, describePeriodic } from "../content/periodicQuests";
import { getPeriodViews, recordPeriodic } from "../core/periodicQuests";
import { createSave } from "../core/save";
import { t } from "../i18n";
import { GameUi } from "./GameUi";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function openQuests(save = createSave()): HTMLElement {
    const store = new GameStore(save);
    store.set({ screen: "quests" });
    const client = new Proxy({}, { get: () => vi.fn() });
    const { container } = render(<GameUi store={store} client={client as unknown as GameClient} />);
    return container.querySelector(".ui-quests") as HTMLElement;
}

describe("the quest screen's daily and weekly quests", () => {
    test("lists three daily and two weekly quests, with what they pay", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.UTC(2026, 10, 23, 10));
        const quests = openQuests();
        const now = Date.now();
        const daily = quests.querySelector('[data-kind="daily"]') as HTMLElement;
        const weekly = quests.querySelector('[data-kind="weekly"]') as HTMLElement;
        expect(within(daily).getByText(t("quest.daily"))).toBeTruthy();
        expect(within(weekly).getByText(t("quest.weekly"))).toBeTruthy();
        expect(daily.querySelectorAll(".ui-quest")).toHaveLength(DAILY_COUNT);
        expect(weekly.querySelectorAll(".ui-quest")).toHaveLength(WEEKLY_COUNT);
        for (const kind of ["daily", "weekly"] as const) {
            for (const view of getPeriodViews(createSave(), kind, now)) {
                expect(within(quests).getByText(describePeriodic(view.quest))).toBeTruthy();
            }
        }
    });

    test("shows progress, and Done once a quest's finished", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.UTC(2026, 10, 23, 10));
        const save = createSave();
        // A run big enough to finish every kind of goal it can
        recordPeriodic(
            save,
            {
                mapId: "lumbridge",
                victory: true,
                beatsMap: true,
                seconds: 1500,
                level: 30,
                kills: 5000,
                bossesKilled: ["a", "b", "c", "d", "e", "f", "g"],
                caskets: 20,
            },
            Date.now(),
        );
        const quests = openQuests(save);
        const daily = quests.querySelector('[data-kind="daily"]') as HTMLElement;
        expect(within(daily).getAllByText(t("quest.done")).length).toBeGreaterThan(0);
        // A new save shows none of them done
        cleanup();
        const fresh = openQuests().querySelector('[data-kind="daily"]') as HTMLElement;
        expect(within(fresh).queryByText(t("quest.done"))).toBeNull();
        expect(within(fresh).getAllByText(/^0 \//).length).toBe(DAILY_COUNT);
    });
});
