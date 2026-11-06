// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CloudView } from "../client/CloudSave";
import { GameClient } from "../client/GameClient";
import { createSave } from "../core/save";
import { CloudChoicePanel, CloudSaveButton, CloudSaveSettings } from "./CloudSave";

afterEach(cleanup);

const CODE = "K7Q2-M9XD-4TPA-W3RN-H8BE-6FZC";

function mockClient() {
    const cloud = {
        turnOn: vi.fn(),
        useCode: vi.fn(async () => true),
        check: vi.fn(),
        turnOff: vi.fn(),
        deleteCloud: vi.fn(),
        reopenChoice: vi.fn(),
        useCloud: vi.fn(),
        keepLocal: vi.fn(),
        later: vi.fn(),
    };
    return { cloud, client: { cloud } as unknown as GameClient };
}

function settings(view: CloudView | undefined, saving = true) {
    const mock = mockClient();
    render(<CloudSaveSettings cloud={view} client={mock.client} saving={saving} />);
    return mock.cloud;
}

test("isn't there where the build has no cloud save, or its Worker didn't answer", () => {
    const { container } = render(
        <CloudSaveSettings cloud={undefined} client={mockClient().client} saving />,
    );
    expect(container).toBeEmptyDOMElement();
});

test("turns on, or links a code typed in", () => {
    const cloud = settings({ working: false });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(cloud.turnOn).toHaveBeenCalledTimes(1);
    const link = screen.getByRole("button", { name: "Link" });
    expect(link).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Sync code" }), {
        target: { value: CODE.toLowerCase() },
    });
    fireEvent.click(link);
    expect(cloud.useCode).toHaveBeenCalledWith(CODE.toLowerCase());
});

test("waits while the game isn't saving here", () => {
    settings({ working: false }, false);
    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
});

test("shows the code and what's wrong, once on", () => {
    const cloud = settings({ code: CODE, working: false, problem: "offline" });
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.getByText(/Can't reach cloud save/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(cloud.check).toHaveBeenCalledTimes(1);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(cloud.deleteCloud).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(cloud.deleteCloud).toHaveBeenCalledTimes(1);
});

test("asks which save to keep, and won't load a newer game's", () => {
    const { client, cloud } = mockClient();
    const view = (newer: boolean): CloudView => ({
        code: CODE,
        working: false,
        choice: {
            newer,
            closed: false,
            cloud: {
                revision: 4,
                updatedAt: 0,
                summary: {
                    gameVersion: newer ? "9.0.0" : "0.28.0",
                    runs: 120,
                    victories: 30,
                    totalCoins: 50000,
                    mapsBeaten: 9,
                },
            },
        },
    });
    const save = { ...createSave(), runs: 5 };
    const { rerender } = render(
        <CloudChoicePanel cloud={view(false)} save={save} client={client} />,
    );
    expect(screen.getByText(/120 runs, 30 wins, 9 maps beaten/)).toBeInTheDocument();
    expect(screen.getByText(/5 runs, 0 wins/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the cloud's" }));
    expect(cloud.useCloud).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep this device's" }));
    expect(cloud.keepLocal).toHaveBeenCalledTimes(1);
    rerender(<CloudChoicePanel cloud={view(true)} save={save} client={client} />);
    expect(screen.getByRole("button", { name: "Use the cloud's" })).toBeDisabled();
    expect(screen.getByText(/newer version of Run Escape/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(cloud.later).toHaveBeenCalledTimes(1);
});

test("has a button on the title that says how it's doing and opens the way in", () => {
    const { client, cloud } = mockClient();
    const open = vi.fn();
    const { container, rerender } = render(
        <CloudSaveButton cloud={undefined} client={client} onOpenSettings={open} />,
    );
    expect(container).toBeEmptyDOMElement();
    const at = (view: CloudView) =>
        rerender(<CloudSaveButton cloud={view} client={client} onOpenSettings={open} />);
    at({ working: false });
    fireEvent.click(screen.getByRole("button", { name: "Cloud save: off" }));
    expect(open).toHaveBeenCalledTimes(1);
    at({ code: CODE, working: false, problem: "offline" });
    expect(screen.getByRole("button", { name: /^Cloud save: Can't reach/ })).toBeInTheDocument();
    at({
        code: CODE,
        working: false,
        choice: { newer: false, closed: true, cloud: { revision: 2 } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cloud save: pick which save to keep" }));
    expect(cloud.reopenChoice).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
});
