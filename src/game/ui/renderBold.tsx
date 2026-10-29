import { ReactNode } from "react";

// **Bold** is the only markup the changelog and the notice use
export function renderBold(text: string): ReactNode[] {
    return text
        .split(/\*\*(.+?)\*\*/)
        .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
