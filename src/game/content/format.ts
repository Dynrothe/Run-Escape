// How times are written, wherever the content, the client or the screens say them

// Seconds as m:ss
export function formatTime(seconds: number): string {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
