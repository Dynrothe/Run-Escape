// How times and lists are written, wherever the content, the client or the screens say them

// Seconds as m:ss
export function formatTime(seconds: number): string {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// "A", "A and B", "A, B and C"
export function joinNames(names: readonly string[]): string {
    return names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : names[0];
}
