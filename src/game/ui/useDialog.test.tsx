// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";

import { useDialog } from "./useDialog";

afterEach(cleanup);

function Window(): JSX.Element {
    const { titleId, dialogProps } = useDialog<HTMLDivElement>();
    return (
        <div className="ui-modal">
            <div {...dialogProps}>
                <h2 id={titleId}>A window</h2>
                <button>In it</button>
            </div>
        </div>
    );
}

// A screen with a window in it, and a notice over every screen, as the language notice is
function Ui({ open }: { open: boolean }): JSX.Element {
    return (
        <div className="ui-contents">
            <div className="ui-fill">
                <button>Behind</button>
                <div className="ui-toasts" />
                {open && <Window />}
            </div>
            <div className="ui-fill ui-modal ui-notice-over">
                <button>Got it</button>
            </div>
        </div>
    );
}

test("takes the focus, and makes what's behind it inert till it closes", () => {
    const { container, rerender } = render(<Ui open />);
    expect(screen.getByRole("dialog", { name: "A window" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Behind" }).closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "In it" }).closest("[inert]")).toBeNull();
    rerender(<Ui open={false} />);
    expect(container.querySelector("[inert]")).toBeNull();
});

test("leaves toasts to be announced, and another window over it to be answered", () => {
    render(<Ui open />);
    expect(document.querySelector(".ui-toasts")!.closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Got it" }).closest("[inert]")).toBeNull();
});
