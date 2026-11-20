// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { GameClient } from "../client/GameClient";
import { GameStore, UiSnapshot } from "../client/GameStore";
import {
    InvocationPreset,
    MAX_INVOCATION_PRESETS,
    RUN_INVOCATIONS,
    getRaidLevel,
    invocationDescription,
    invocationName,
} from "../content/invocations";
import { createSave } from "../core/save";
import { InvocationPresets, RunInvocationBoard } from "./Invocations";

afterEach(cleanup);

function presetsPanel(presets: InvocationPreset[], on: string[] = []) {
    const client = {
        saveInvocationPreset: vi.fn(),
        loadInvocationPreset: vi.fn(),
        deleteInvocationPreset: vi.fn(),
    };
    const draw = (list: InvocationPreset[]) => {
        const save = { ...createSave(), invocations: on, invocationPresets: list };
        return (
            <InvocationPresets
                ui={{ save } as unknown as UiSnapshot}
                client={client as unknown as GameClient}
                on={on}
                level={getRaidLevel(on)}
            />
        );
    };
    const { rerender } = render(draw(presets));
    return { client, redraw: (list: InvocationPreset[]) => rerender(draw(list)) };
}

const DIET = { name: "Diet", invocations: ["on_a_diet"] };
const SPEED = { name: "Speed", invocations: ["try_again"] };

test("delete on a second press, and take the first back on any other press", () => {
    const { client, redraw } = presetsPanel([DIET, SPEED]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Diet" }));
    expect(client.deleteInvocationPreset).not.toHaveBeenCalled();
    // Safari gives a pressed button no focus, so a press elsewhere has to do it, not a blur
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Load Speed/ }));
    expect(screen.getByRole("button", { name: "Delete Diet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Diet" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Press again to delete Diet" }));
    fireEvent.click(screen.getByRole("button", { name: "Press again to delete Diet" }));
    expect(client.deleteInvocationPreset).toHaveBeenCalledWith("Diet");
    // On to Save once it's gone, not the name box (a phone's keyboard)
    redraw([SPEED]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
});

test("load by name, and mark the one on the board", () => {
    const { client } = presetsPanel([DIET, SPEED], ["on_a_diet"]);
    const diet = screen.getByRole("button", { name: "Load Diet, raid level 15" });
    expect(diet).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Load Speed, raid level 5" })).not.toHaveAttribute(
        "aria-current",
    );
    fireEvent.click(diet);
    expect(client.loadInvocationPreset).toHaveBeenCalledWith("Diet");
});

test("say the level once for one named by it", () => {
    presetsPanel([{ name: "Raid level 15", invocations: ["on_a_diet"] }]);
    expect(screen.getByRole("button", { name: "Load Raid level 15" })).toHaveTextContent(
        /^Raid level 15$/,
    );
});

test("full, save only over one by its name", () => {
    const presets = Array.from({ length: MAX_INVOCATION_PRESETS }, (_, i) => ({
        name: `Set ${i}`,
        invocations: [],
    }));
    const { client } = presetsPanel(presets);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/are used/)).toBeInTheDocument();
    // Enter in the name box doesn't get round it
    const box = screen.getByRole("textbox", { name: "Preset name" }) as HTMLInputElement;
    fireEvent.submit(box.form as HTMLFormElement);
    expect(client.saveInvocationPreset).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Preset name" }), {
        target: { value: "Set 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(client.saveInvocationPreset).toHaveBeenCalledWith("Set 2");
    expect(screen.getByRole("textbox", { name: "Preset name" })).toHaveValue("");
});

test("a run's board: hard mode's four are only to see, and one switch turns them on", () => {
    const save = createSave();
    save.mapVictories.lumbridge = 1;
    const client = {
        toggleHard: vi.fn(),
        toggleRunInvocation: vi.fn(),
        clearRunInvocations: vi.fn(),
    };
    render(
        <RunInvocationBoard
            ui={new GameStore(save).getSnapshot()}
            client={client as unknown as GameClient}
            room={{ mapId: "lumbridge", hard: false }}
            onClose={() => {}}
        />,
    );
    const hardFour = RUN_INVOCATIONS.filter((invocation) => invocation.hard);
    expect(hardFour).toHaveLength(4);
    for (const invocation of hardFour) {
        const name = invocationName(invocation);
        expect(screen.queryByRole("button", { name })).toBeNull();
        // Pressed, it only says what it does
        fireEvent.click(screen.getByRole("img", { name }));
        expect(screen.getByText(invocationDescription(invocation))).toBeVisible();
    }
    expect(client.toggleRunInvocation).not.toHaveBeenCalled();
    const hard = screen.getByRole("button", { name: "Hard" });
    expect(hard).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(hard);
    expect(client.toggleHard).toHaveBeenCalledOnce();
});
