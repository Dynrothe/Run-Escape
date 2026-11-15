import { ItemIcon } from "./ItemIcon";

// The tab an arrow key, Home or End moves to from the one that's open, round from the last to
// the first and back
export function getTabFromKey<T>(
    key: string,
    tabs: readonly T[],
    open: T | undefined,
): T | undefined {
    const index = open === undefined ? -1 : tabs.indexOf(open);
    return key === "ArrowRight"
        ? tabs[(index + 1) % tabs.length]
        : key === "ArrowLeft"
          ? tabs[(index + tabs.length - 1) % tabs.length]
          : key === "Home"
            ? tabs[0]
            : key === "End"
              ? tabs[tabs.length - 1]
              : undefined;
}

export type TabDef<T extends string> = {
    id: T;
    name: string;
    // The client's own side tab icon (titleIcons.ts), beside the name
    spriteId?: number;
};

// A row of stone tabs over a panel's pages, the open one pressed in (none of them, when the page
// that's open isn't one of these: the pause menu's settings). Each page is
// `${idPrefix}-page-${id}`, labelled by its tab.
export function TabBar<T extends string>({
    tabs,
    open,
    onOpen,
    idPrefix,
    label,
    className,
}: {
    tabs: TabDef<T>[];
    open: T | undefined;
    onOpen: (id: T) => void;
    idPrefix: string;
    label: string;
    className?: string;
}): JSX.Element {
    const ids = tabs.map((tab) => tab.id);
    return (
        <div
            className={"ui-tabs ui-page-tabs" + (className ? " " + className : "")}
            role="tablist"
            aria-label={label}
            onKeyDown={(event) => {
                const focused = tabs.find(
                    (tab) => `${idPrefix}-tab-${tab.id}` === (event.target as HTMLElement).id,
                )?.id;
                const next = getTabFromKey(event.key, ids, focused ?? open);
                if (next) {
                    event.preventDefault();
                    onOpen(next);
                    event.currentTarget
                        .querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next}`)
                        ?.focus();
                }
            }}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    id={`${idPrefix}-tab-${tab.id}`}
                    className="ui-button"
                    role="tab"
                    tabIndex={open === tab.id || (open === undefined && tab === tabs[0]) ? 0 : -1}
                    aria-selected={open === tab.id}
                    aria-controls={`${idPrefix}-page-${tab.id}`}
                    aria-label={tab.name}
                    title={tab.name}
                    onClick={() => onOpen(tab.id)}
                >
                    {tab.spriteId !== undefined && (
                        <ItemIcon objId={-1} spriteId={tab.spriteId} size={24} />
                    )}
                    <span className="ui-page-tab-name">{tab.name}</span>
                </button>
            ))}
        </div>
    );
}
