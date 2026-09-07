/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Line {
    /** Milliseconds into the track. */
    at: number;
    text: string;
}

/*
 * LRC is a plain text format: a timestamp in square brackets, then the line it belongs to.
 *
 *   [ar:Artist]
 *   [offset:-500]
 *   [00:12.34]the first line
 *   [00:15.00][01:42.10]a line that comes round twice
 *
 * Metadata tags share the bracket syntax with timestamps, so the two are told apart by
 * whether what is inside parses as a time. `offset` is the one tag worth honouring: it
 * shifts every timestamp, and some transcriptions rely on it to line up.
 */
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /\[offset:\s*([+-]?\d+)\s*\]/i;

export function parseLrc(source: string): Line[] {
    const offset = Number(OFFSET.exec(source)?.[1] ?? 0);
    const lines: Line[] = [];

    for (const raw of source.split(/\r?\n/)) {
        TIMESTAMP.lastIndex = 0;

        const stamps: number[] = [];
        let match: RegExpExecArray | null;
        let end = 0;

        while ((match = TIMESTAMP.exec(raw))) {
            // Only the run of timestamps at the start of the line counts. A bracketed
            // time in the middle of a lyric is part of the words.
            if (match.index !== end) break;
            end = match.index + match[0].length;

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const fraction = match[3] ?? "0";

            // Hundredths in most files, thousandths in some. Pad rather than assume.
            const millis = Number(fraction.padEnd(3, "0").slice(0, 3));

            stamps.push(minutes * 60_000 + seconds * 1000 + millis);
        }

        if (!stamps.length) continue;

        const text = raw.slice(end).trim();
        for (const at of stamps) lines.push({ at: Math.max(0, at + offset), text });
    }

    return lines.sort((a, b) => a.at - b.at);
}

/**
 * The line playing at `position`, or null before the first one.
 *
 * Instrumental gaps come through as empty lines in a good transcription, and those are
 * kept rather than skipped - showing the previous line for the length of a guitar solo
 * would be worse than showing nothing.
 */
export function lineAt(lines: Line[], position: number): Line | null {
    if (!lines.length) return null;

    let low = 0;
    let high = lines.length - 1;
    let found = -1;

    while (low <= high) {
        const middle = (low + high) >> 1;
        if (lines[middle].at <= position) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return found === -1 ? null : lines[found];
}
