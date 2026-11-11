// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { useConfirm } from "./ConfirmDialog";

afterEach(cleanup);

function Asker({
    onAnswer,
    onKey,
}: {
    onAnswer: (confirmed: boolean) => void;
    onKey?: () => void;
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

async function open(onAnswer = vi.fn(), onKey?: () => void) {
    render(<Asker onAnswer={onAnswer} onKey={onKey} />);
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
