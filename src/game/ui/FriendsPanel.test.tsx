// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { GameClient } from "../client/GameClient";
import { GameStore, UiSnapshot } from "../client/GameStore";
import type { CoopView } from "../client/coop/CoopLobby";
import type { FriendPopup, FriendsView } from "../client/coop/Friends";
import type { RoomView } from "../client/coop/protocol";
import { createSave } from "../core/save";
import { keyForEnglish } from "../i18n/catalog";
import { POPUP_MS } from "./FriendPopups";
import { GameUi } from "./GameUi";

vi.mock("@foxglove/wasm-bz2/wasm/module.wasm?url", () => ({ default: "" }));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

const LUMBRIDGE_ROOM = { mapId: "lumbridge", endless: false, hard: false };

// A friends list with one of each: in a room to join, in a full one, on their own, and one who
// hasn't added this game back
const POPULATED: Partial<FriendsView> = {
    friends: [
        {
            id: "ALICE0000001",
            name: "Alice",
            online: true,
            state: "room",
            room: { ...LUMBRIDGE_ROOM, code: "ALICEDEN", name: "Plucky Den", players: 2, max: 4 },
            pending: false,
        },
        {
            id: "BOBB00000002",
            name: "Bob",
            online: true,
            state: "room",
            room: { ...LUMBRIDGE_ROOM, code: "BOBSROOM", name: "Full Den", players: 4, max: 4 },
            pending: false,
        },
        { id: "CARL00000003", name: "Carl", online: true, state: "solo", pending: false },
        { id: "DAVE00000004", name: "DAVE-0000-0004", online: false, pending: true },
    ],
    requests: [{ id: "FRAN00000006", name: "Fran" }],
    invites: [
        {
            from: { id: "ERIN00000005", name: "Erin" },
            room: {
                ...LUMBRIDGE_ROOM,
                hard: true,
                code: "ERINROOM",
                name: "Erin's Den",
                players: 1,
                max: 4,
            },
            at: 0,
        },
    ],
    recent: [{ id: "GREG00000007", name: "Greg", at: 1 }],
};

function setup({
    screen: shown = "title",
    friends = {},
    coop = {},
}: {
    screen?: UiSnapshot["screen"];
    friends?: Partial<FriendsView>;
    coop?: Partial<CoopView>;
} = {}) {
    const store = new GameStore(createSave());
    const base = store.getSnapshot();
    store.set({
        screen: shown,
        friends: {
            ...base.friends,
            supported: true,
            status: "online",
            myCode: "MINE00000000",
            name: "Me",
            ...friends,
        },
        coop: { ...base.coop, available: true, ...coop },
    });
    const setFriends = (change: Partial<FriendsView>) =>
        store.set({ friends: { ...store.getSnapshot().friends, ...change } });
    const client = {
        store,
        playClick: vi.fn(),
        showScreen: vi.fn(),
        openCoop: vi.fn(),
        closeCoop: vi.fn(),
        joinRoom: vi.fn(),
        showRoomsPage: vi.fn(),
        renameCoop: vi.fn(),
        createRoom: vi.fn(),
        setRoomAccess: vi.fn(),
        setRoomOpen: vi.fn(),
        getInviteLink: vi.fn(() => "https://example.test/?room=ROOM"),
        selectMap: vi.fn(),
        selectCharacter: vi.fn(),
        setCoopReady: vi.fn(),
        startCoopRun: vi.fn(),
        leaveRoom: vi.fn(),
        kickPlayer: vi.fn(),
        toggleFavouriteCharacter: vi.fn(),
        addFriend: vi.fn(() => "added"),
        removeFriend: vi.fn(),
        acceptFriendRequest: vi.fn(() => "added"),
        ignoreFriendRequest: vi.fn(),
        setPlayerName: vi.fn(() => true),
        inviteFriend: vi.fn(() => true),
        acceptInvite: vi.fn(() => "joining"),
        joinFriend: vi.fn(() => "joining"),
        declineInvite: vi.fn(),
        sendChat: vi.fn(() => true),
        dismissFriendPopup: vi.fn((id: number) =>
            setFriends({
                popups: store.getSnapshot().friends.popups.filter((p) => p.id !== id),
            }),
        ),
        friends: { clearNotice: vi.fn() },
    };
    render(<GameUi store={store} client={client as unknown as GameClient} />);
    return { store, client, setFriends };
}

function room(change: Partial<RoomView> = {}): RoomView {
    return {
        code: "TESTROOM",
        name: "Party",
        open: false,
        hostId: "alice",
        mapId: "lumbridge",
        endless: false,
        hard: false,
        started: false,
        members: [
            { id: "alice", name: "Alice", characterId: "warrior", ready: false },
            {
                id: "bob",
                friendId: "BOBB00000002",
                name: "Bob",
                characterId: "wizard",
                ready: true,
            },
        ],
        ...change,
    };
}

function openWindow(name: RegExp | string = /^Friends/): HTMLElement {
    fireEvent.click(screen.getByRole("button", { name }));
    return screen.getByRole("dialog", { name: "Friends" });
}

describe("on a relay without friends", () => {
    test("nothing of friends shows, on the title, the co-op menu or in a room", () => {
        expect.hasAssertions();
        const off = { supported: false };
        setup({ friends: off });
        expect(screen.getByRole("button", { name: "Multiplayer" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Friends/ })).toBeNull();
        expect(document.querySelector(".ui-friend-popups")).toBeNull();
        cleanup();

        const { client } = setup({ screen: "coop", friends: off, coop: { status: "online" } });
        expect(screen.queryByRole("button", { name: /^Friends/ })).toBeNull();
        expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
        const group = screen.getByRole("group", { name: "Who can join" });
        expect(
            within(group)
                .getAllByRole("button")
                .map((b) => b.textContent),
        ).toEqual(["Invite only", "Open to all"]);
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(client.createRoom).toHaveBeenCalledExactlyOnceWith("invite");
        cleanup();

        setup({ screen: "coop", friends: off, coop: { you: "alice", anyMap: true, room: room() } });
        expect(screen.queryByRole("button", { name: /^Invite friends/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /as a friend$/ })).toBeNull();
        expect(screen.queryByRole("log", { name: "Chat" })).toBeNull();
    }, 30000);

    test("a host's pair still only opens or closes the room", () => {
        const { client } = setup({
            screen: "coop",
            friends: { supported: false },
            coop: { you: "alice", anyMap: true, room: room() },
        });
        const group = screen.getByRole("group", { name: "Who can join" });
        fireEvent.click(within(group).getByRole("button", { name: "Open to all" }));
        expect(client.setRoomOpen).toHaveBeenCalledExactlyOnceWith(true);
        expect(client.setRoomAccess).not.toHaveBeenCalled();
    }, 30000);
});

test("the title's Friends button says who's online and what's waiting, and opens the window", () => {
    setup({ friends: POPULATED });
    const button = screen.getByRole("button", { name: "Friends: 3 online and 2 new" });
    expect(within(button).getByText("2")).toHaveClass("ui-friends-badge");
    expect(within(button).getByText("3 online")).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Friends" })).toBeInTheDocument();
});

test("the window lists requests, invites, friends where they are, and those played with", () => {
    const { client } = setup({ friends: POPULATED });
    const dialog = openWindow();
    // You: the code to give out
    expect(within(dialog).getByText("MINE-0000-0000")).toBeInTheDocument();
    // A request: accepted, or ignored
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));
    expect(client.acceptFriendRequest).toHaveBeenCalledExactlyOnceWith("FRAN00000006");
    expect(within(dialog).getByText("You and Fran are friends now.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Ignore" }));
    expect(client.ignoreFriendRequest).toHaveBeenCalledExactlyOnceWith("FRAN00000006");
    // An invite, with its room
    expect(within(dialog).getByText("Erin's Den · Lumbridge, hard · 1/4")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    expect(client.declineInvite).toHaveBeenCalledExactlyOnceWith("ERIN00000005");
    // Friends: where each is, and Join only into a room with space
    expect(within(dialog).getByText("In Plucky Den · Lumbridge · 2/4")).toBeInTheDocument();
    expect(within(dialog).getByText("In Full Den · Lumbridge · full")).toBeInTheDocument();
    expect(within(dialog).getByText("On a run of their own")).toBeInTheDocument();
    expect(
        within(dialog).getByText("Waiting for them to add you back · DAVE-0000-0004"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Join Bob" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Join Carl" })).toBeNull();
    // No room of your own, so nobody to invite
    expect(within(dialog).queryByRole("button", { name: /^Invite / })).toBeNull();
    // Played with
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Greg as a friend" }));
    expect(client.addFriend).toHaveBeenCalledExactlyOnceWith("GREG00000007");
    // Joining closes the window, unless it can't
    client.joinFriend.mockReturnValueOnce("inRun");
    fireEvent.click(within(dialog).getByRole("button", { name: "Join Alice" }));
    expect(client.joinFriend).toHaveBeenLastCalledWith("ALICE0000001");
    expect(within(dialog).getByText("Finish or leave your run first.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Join Alice" }));
    expect(screen.queryByRole("dialog", { name: "Friends" })).toBeNull();
}, 30000);

test("an empty list says how friends work", () => {
    setup();
    const dialog = openWindow();
    expect(within(dialog).getByText("Share your code, and add your friend's.")).toBeInTheDocument();
    expect(
        within(dialog).getByText("You're friends once you've both added each other."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: /Friend requests/ })).toBeNull();
    expect(within(dialog).queryByRole("heading", { name: /Recently played with/ })).toBeNull();
});

test("Add says what came of it", () => {
    const { client } = setup();
    const dialog = openWindow();
    const input = within(dialog).getByRole("textbox", { name: "Add a friend" });
    const results: [string, RegExp][] = [
        ["invalid", /^That isn't a friend code\. A code is 12 letters/],
        ["self", /^That's your own code\.$/],
        ["already", /^They're already on your list\.$/],
        ["full", /^Your list is full at 200 friends/],
        ["added", /^Added\. They show as waiting until they add you back\.$/],
    ];
    for (const [result, line] of results) {
        client.addFriend.mockReturnValueOnce(result);
        fireEvent.change(input, { target: { value: "abcd-efgh-jkmn" } });
        fireEvent.submit(input.closest("form")!);
        expect(within(dialog).getByRole("status")).toHaveTextContent(line);
    }
    expect(client.addFriend).toHaveBeenLastCalledWith("abcd-efgh-jkmn");
    // Cleared once added
    expect(input).toHaveValue("");
});

test("the name is saved as typed, and an empty one isn't", () => {
    const { client } = setup();
    const dialog = openWindow();
    const input = within(dialog).getByRole("textbox", { name: "Your name" });
    expect(input).toHaveValue("Me");
    // Only the co-op menu's connection asks for a new one
    expect(within(dialog).queryByRole("button", { name: "New name" })).toBeNull();
    client.setPlayerName.mockReturnValueOnce(false);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(within(dialog).getByText("Type a name first.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Zezima" } });
    fireEvent.submit(input.closest("form")!);
    expect(client.setPlayerName).toHaveBeenLastCalledWith("Zezima");
    expect(within(dialog).getByText("Name saved.")).toBeInTheDocument();
});

test("Escape and Space in the window go no further than it", () => {
    expect.hasAssertions();
    const { client } = setup({ friends: POPULATED });
    let dialog = openWindow();
    // The title starts a run on Space
    fireEvent.keyDown(dialog, { code: "Space", key: " " });
    fireEvent.keyDown(within(dialog).getByRole("textbox", { name: "Your name" }), {
        code: "Space",
        key: " ",
    });
    expect(client.showScreen).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { code: "Escape", key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Friends" })).toBeNull();
    cleanup();

    // The co-op menu leaves on Escape
    const coop = setup({ screen: "coop", friends: POPULATED, coop: { friends: true } });
    dialog = openWindow(/^Friends:/);
    fireEvent.keyDown(dialog, { code: "Escape", key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Friends" })).toBeNull();
    expect(coop.client.closeCoop).not.toHaveBeenCalled();
    // A confirmation over it answers Escape alone
    dialog = openWindow(/^Friends:/);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Alice" }));
    const ask = screen.getByRole("alertdialog", { name: "Remove Alice?" });
    fireEvent.keyDown(ask, { code: "Escape", key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Friends" })).toBeInTheDocument();
    expect(coop.client.removeFriend).not.toHaveBeenCalled();
}, 30000);

test("Remove asks first", async () => {
    const { client } = setup({ friends: POPULATED });
    const dialog = openWindow();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Carl" }));
    const ask = screen.getByRole("alertdialog", { name: "Remove Carl?" });
    await act(async () => {
        fireEvent.click(within(ask).getByRole("button", { name: "Remove" }));
    });
    expect(client.removeFriend).toHaveBeenCalledExactlyOnceWith("CARL00000003");
    expect(screen.getByRole("dialog", { name: "Friends" })).toBeInTheDocument();
});

describe("in a room on a relay with friends", () => {
    function inRoom(change: Partial<CoopView> = {}, friends: Partial<FriendsView> = POPULATED) {
        return setup({
            screen: "coop",
            friends,
            coop: { you: "alice", anyMap: true, friends: true, room: room(), ...change },
        });
    }

    test("Invite asks an online friend in, says how it went, and waits before asking again", () => {
        vi.useFakeTimers();
        const { client, store } = inRoom();
        const dialog = openWindow(/^Invite friends/);
        // Not those offline or still to add you back
        expect(within(dialog).queryByRole("button", { name: "Invite DAVE-0000-0004" })).toBeNull();
        const invite = within(dialog).getByRole("button", { name: "Invite Carl" });
        fireEvent.click(invite);
        expect(client.inviteFriend).toHaveBeenCalledExactlyOnceWith("CARL00000003");
        expect(invite).toBeDisabled();
        const coop = store.getSnapshot().coop;
        act(() => store.set({ coop: { ...coop, invited: { CARL00000003: "sent" } } }));
        expect(within(dialog).getByText("Invited")).toBeInTheDocument();
        expect(invite).toHaveTextContent("Invite again");
        act(() => vi.advanceTimersByTime(10_000));
        expect(invite).toBeEnabled();
        act(() => store.set({ coop: { ...coop, invited: { CARL00000003: "declined" } } }));
        expect(within(dialog).getByText("Declined")).toBeInTheDocument();
        // The relay's word on it, in the player's language
        act(() =>
            store.set({
                coop: { ...store.getSnapshot().coop, error: "That friend isn't online." },
            }),
        );
        expect(within(dialog).getByRole("status")).toHaveTextContent("That friend isn't online.");
    }, 30000);

    test("a friend already in the room is said to be, and isn't invited", () => {
        // Invited before they came in: that's done with now
        inRoom(
            { invited: { BOBB00000002: "sent" } },
            {
                ...POPULATED,
                friends: [
                    {
                        id: "BOBB00000002",
                        name: "Bob",
                        online: true,
                        state: "room",
                        pending: false,
                    },
                ],
            },
        );
        const dialog = openWindow(/^Invite friends/);
        expect(within(dialog).getByText("In your room")).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Invite Bob" })).toBeNull();
        expect(within(dialog).queryByText("Invited")).toBeNull();
        // Nor offered from the party as a friend to add
        expect(screen.queryByRole("button", { name: "Add Bob as a friend" })).toBeNull();
    }, 30000);

    test("someone not on the list can be added from the party", () => {
        const { client } = inRoom({}, { friends: [] });
        fireEvent.click(screen.getByRole("button", { name: "Add Bob as a friend" }));
        expect(client.addFriend).toHaveBeenCalledExactlyOnceWith("BOBB00000002");
    }, 30000);

    test("the host picks from three, and making a room takes the one picked", () => {
        expect.hasAssertions();
        const { client } = inRoom();
        const group = screen.getByRole("group", { name: "Who can join" });
        expect(within(group).getByRole("button", { name: "Invite only" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        fireEvent.click(within(group).getByRole("button", { name: "Friends" }));
        expect(client.setRoomAccess).toHaveBeenCalledExactlyOnceWith("friends");
        fireEvent.click(within(group).getByRole("button", { name: "Open to all" }));
        expect(client.setRoomAccess).toHaveBeenLastCalledWith("open");
        cleanup();

        // A room that's for friends shows as such, with what it means
        inRoom({ room: room({ friends: true }) });
        expect(
            within(screen.getByRole("group", { name: "Who can join" })).getByRole("button", {
                name: "Friends",
            }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
            screen.getByText("Friends of anyone in the room can see it and join."),
        ).toBeInTheDocument();
        cleanup();

        const menu = setup({
            screen: "coop",
            friends: POPULATED,
            coop: { status: "online", friends: true },
        });
        const choice = screen.getByRole("group", { name: "Who can join" });
        fireEvent.click(within(choice).getByRole("button", { name: "Friends" }));
        fireEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(menu.client.createRoom).toHaveBeenCalledExactlyOnceWith("friends");
    }, 30000);

    test("the chat shows its lines as text, and sends what's typed", () => {
        expect.hasAssertions();
        const { client } = inRoom({
            chat: [
                { id: 1, from: "bob", name: "Bob", text: "<b>hi</b>", mine: false, at: 0 },
                { id: 2, from: "alice", name: "Alice", text: "hello", mine: true, at: 0 },
                { id: 3, from: "carl", name: "", text: "bye", mine: false, at: 0 },
            ],
        });
        const log = screen.getByRole("log", { name: "Chat" });
        expect(within(log).getByText("<b>hi</b>")).toBeInTheDocument();
        expect(log.querySelector("b")).toBeNull();
        expect(within(log).getByText("Alice (you):")).toBeInTheDocument();
        expect(within(log).getByText("Someone who left:")).toBeInTheDocument();
        const input = screen.getByRole("textbox", { name: "Message the room" });
        // What's typed never reaches the screen's own keys
        const heard = vi.fn();
        window.addEventListener("keydown", heard);
        try {
            fireEvent.keyDown(input, { code: "Escape", key: "Escape" });
            fireEvent.keyDown(input, { code: "Space", key: " " });
            expect(heard).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener("keydown", heard);
        }
        fireEvent.change(input, { target: { value: "gl hf" } });
        fireEvent.submit(input.closest("form")!);
        expect(client.sendChat).toHaveBeenCalledExactlyOnceWith("gl hf");
        expect(input).toHaveValue("");
        // Kept when it didn't go
        client.sendChat.mockReturnValueOnce(false);
        fireEvent.change(input, { target: { value: "again" } });
        fireEvent.submit(input.closest("form")!);
        expect(input).toHaveValue("again");
    }, 30000);
});

describe("popups", () => {
    function popup(id: number, kind: FriendPopup["kind"], name: string): FriendPopup {
        return {
            id,
            kind,
            from: { id: `${name.toUpperCase().padEnd(4, "X").slice(0, 4)}0000000${id}`, name },
            at: Date.now(),
            ...(kind === "invite" && {
                room: { ...LUMBRIDGE_ROOM, code: "INVITE01", name: "Den", players: 1, max: 4 },
            }),
        };
    }

    test("each kind says what it's about, and its buttons do it", () => {
        const { client } = setup({
            screen: "coop",
            friends: {
                popups: [popup(1, "invite", "Erin"), popup(2, "request", "Fran")],
            },
        });
        const popups = document.querySelector<HTMLElement>(".ui-friend-popups")!;
        expect(popups).toHaveAttribute("role", "status");
        expect(within(popups).getByText("Erin invited you to Den")).toBeInTheDocument();
        expect(within(popups).getByText("Lumbridge · 1/4")).toBeInTheDocument();
        expect(within(popups).getByText("Fran wants to be friends")).toBeInTheDocument();
        // A click leaves the focus where it was
        const join = within(popups).getByRole("button", { name: "Join" });
        expect(fireEvent.mouseDown(join)).toBe(false);
        fireEvent.click(join);
        expect(client.acceptInvite).toHaveBeenCalledExactlyOnceWith("ERIN00000001");
        fireEvent.click(within(popups).getByRole("button", { name: "Decline" }));
        expect(client.declineInvite).toHaveBeenCalledExactlyOnceWith("ERIN00000001");
        fireEvent.click(within(popups).getByRole("button", { name: "Accept" }));
        expect(client.acceptFriendRequest).toHaveBeenCalledExactlyOnceWith("FRAN00000002");
        fireEvent.click(within(popups).getByRole("button", { name: "Ignore" }));
        expect(client.ignoreFriendRequest).toHaveBeenCalledExactlyOnceWith("FRAN00000002");
        // Nothing behind them is made inert, and they're no window
        expect(document.querySelector("[inert]")).toBeNull();
        expect(popups.closest(".ui-modal")).toBeNull();
    });

    test("an invite that can't be taken says why: kept during a run, gone when it's gone", () => {
        vi.useFakeTimers();
        const { client } = setup({ friends: { popups: [popup(1, "invite", "Erin")] } });
        const popups = document.querySelector<HTMLElement>(".ui-friend-popups")!;
        client.acceptInvite.mockReturnValueOnce("inRun");
        fireEvent.click(within(popups).getByRole("button", { name: "Join" }));
        expect(within(popups).getByText(/^Finish or leave your run first\./)).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(60_000));
        expect(client.dismissFriendPopup).not.toHaveBeenCalled();
        client.acceptInvite.mockReturnValueOnce("gone");
        fireEvent.click(within(popups).getByRole("button", { name: "Join" }));
        expect(within(popups).getByText("That invite's gone.")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(5000));
        expect(client.dismissFriendPopup).toHaveBeenCalledExactlyOnceWith(1);
        expect(within(popups).queryByText(/invited you/)).toBeNull();
    });

    test("a friend online, or saying no, goes by itself", () => {
        vi.useFakeTimers();
        const { client } = setup({
            friends: { popups: [popup(1, "online", "Carl"), popup(2, "declined", "Bob")] },
        });
        const popups = document.querySelector<HTMLElement>(".ui-friend-popups")!;
        expect(within(popups).getByText("Carl is online")).toBeInTheDocument();
        expect(within(popups).getByText("Bob declined your invite")).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(POPUP_MS - 100));
        expect(client.dismissFriendPopup).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(100));
        expect(client.dismissFriendPopup).toHaveBeenCalledWith(1);
        expect(client.dismissFriendPopup).toHaveBeenCalledWith(2);
        expect(within(popups).queryByText("Carl is online")).toBeNull();
    });

    test("in a run they wait under its windows", () => {
        const { store } = setup({
            screen: "run",
            friends: { popups: [popup(1, "request", "Fran")] },
        });
        act(() => store.set({ overlay: "paused" }));
        expect(screen.queryByText("Fran wants to be friends")).toBeNull();
        act(() => store.set({ overlay: "none" }));
        expect(screen.getByText("Fran wants to be friends")).toBeInTheDocument();
        expect(document.querySelector(".ui-friend-popups")).toHaveClass("ui-friend-popups-run");
    });
});

test("the relay's invite errors have English keys, so other languages can show them", () => {
    for (const text of [
        "You need to be in a room to invite friends.",
        "Your room's run has already started.",
        "Your room is full.",
        "You can only invite your friends.",
        "That friend isn't online.",
        "That friend's already in your room.",
        "You've just invited them. Give them a few seconds.",
        "That's a lot of invites. Wait a minute and try again.",
    ]) {
        expect(keyForEnglish(text), text).toMatch(/^coop\.relay\./);
    }
});
