// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmAnswer, useConfirm } from "./ConfirmDialog";

afterEach(cleanup);

function Asker({
    onAnswer,
    onKey,
    alternative,
}: {
    onAnswer: (answer: ConfirmAnswer) => void;
    onKey?: () => void;
    alternative?: string;
}): JSX.Element {
    const [confirm, dialog] = useConfirm();
    return (
        <div onKeyDown={onKey}>
            <button
                onClick={async () =>
                    onAnswer(
                        await confirm({
                            title: "Give up?",
                            body: "The run ends here.",
                            confirm: "Give up",
                            alternative,
                            cancel: "Keep playing",
                        }),
                    )
                }
            >
                Ask
            </button>
            {dialog}
        </div>
    );
}

async function open(onAnswer = vi.fn(), onKey?: () => void, alternative?: string) {
    render(<Asker onAnswer={onAnswer} onKey={onKey} alternative={alternative} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("alertdialog", { name: "Give up?" });
    return onAnswer;
}

test("starts on the way out, so Enter can't do the irreversible thing", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Keep playing" })).toHaveFocus();
});

test("the confirm button says yes", async () => {
    const onAnswer = await open();
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Give up" }));
    });
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("an alternative button returns its own answer", async () => {
    const onAnswer = await open(vi.fn(), undefined, "Restart");
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    });
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("alternative");
    expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("Escape says no, and nothing behind it hears the key", async () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    const onAnswer = await open();
    await act(async () => {
        fireEvent.keyDown(document.body, { code: "Escape", key: "Escape" });
    });
    window.removeEventListener("keydown", heard);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false);
    expect(heard).not.toHaveBeenCalled();
});

test("the page behind it can't be reached while it's open, and can again after", async () => {
    await open();
    const asker = screen
        .getByRole("button", { name: "Ask", hidden: true })
        .closest("div")!.parentElement!;
    expect(asker).toHaveAttribute("inert");
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    });
    expect(asker).not.toHaveAttribute("inert");
});

test("a run's toasts behind it are still announced, and the run's window isn't reachable", async () => {
    // As giving up from the pause menu: the confirm is portaled beside the run's screen
    render(
        <div className="ui-contents">
            <div className="ui-fill">
                <div className="ui-hud">
                    <button>Bag</button>
                </div>
                <div className="ui-fill ui-modal">
                    <Asker onAnswer={vi.fn()} />
                </div>
                <div className="ui-toasts" role="status" />
            </div>
        </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("alertdialog", { name: "Give up?" });
    expect(screen.getByRole("status").closest("[inert]")).toBeNull();
    expect(
        screen.getByRole("button", { name: "Bag", hidden: true }).closest("[inert]"),
    ).not.toBeNull();
    expect(
        screen.getByRole("button", { name: "Ask", hidden: true }).closest("[inert]"),
    ).not.toBeNull();
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    });
    expect(document.querySelector("[inert]")).toBeNull();
});
