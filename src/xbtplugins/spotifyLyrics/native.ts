/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

/*
 * Lyrics come from LRCLIB, which is free, needs no key and no account, and returns the
 * synced LRC transcription rather than a wall of plain text. Its terms ask for a
 * User-Agent that identifies the client, which is the header below.
 *
 * The request runs in the main process because Discord's content security policy blocks
 * the renderer from reaching anything that is not on its own allow list - the same wall
 * that stops CustomProfile talking to kvdb.io. Nothing about the request identifies you:
 * it carries a song title and an artist, and no account, token or user id.
 */
const BASE = "https://lrclib.net/api";
const USER_AGENT = "Xbtcord (https://github.com/xbtcl/xbtcord)";

export interface LyricsResult {
    ok: boolean;
    synced?: string;
    plain?: string;
    /** Set when there is nothing to show, so the UI can say why. */
    reason?: string;
}

export async function fetchLyrics(
    _: IpcMainInvokeEvent,
    track: string,
    artist: string,
    album: string,
    durationSeconds: number
): Promise<LyricsResult> {
    const query = new URLSearchParams({
        track_name: track,
        artist_name: artist
    });

    if (album) query.set("album_name", album);
    if (durationSeconds > 0) query.set("duration", String(Math.round(durationSeconds)));

    try {
        /*
         * The exact-match endpoint first. It matches on duration as well as names, so it
         * will not hand back a live version or a remix whose timings are different - which
         * matters far more here than it would for plain lyrics, because a mismatched
         * transcription is worse than none at all.
         */
        let response = await fetch(`${BASE}/get?${query}`, { headers: { "User-Agent": USER_AGENT } });

        if (response.status === 404) {
            // Nothing exact. Search is looser, so the first hit is only accepted when it
            // is close to the right length.
            const search = new URLSearchParams({ track_name: track, artist_name: artist });
            response = await fetch(`${BASE}/search?${search}`, { headers: { "User-Agent": USER_AGENT } });

            if (!response.ok) return { ok: false, reason: `LRCLIB answered ${response.status}` };

            const results = await response.json() as any[];
            const close = results?.find(entry =>
                !durationSeconds || Math.abs((entry.duration ?? 0) - durationSeconds) <= 4);

            if (!close) return { ok: false, reason: "No transcription for this track" };
            return { ok: true, synced: close.syncedLyrics ?? undefined, plain: close.plainLyrics ?? undefined };
        }

        if (!response.ok) return { ok: false, reason: `LRCLIB answered ${response.status}` };

        const data = await response.json() as any;
        if (data?.instrumental) return { ok: false, reason: "This track is instrumental" };

        return { ok: true, synced: data?.syncedLyrics ?? undefined, plain: data?.plainLyrics ?? undefined };
    } catch (err) {
        return { ok: false, reason: `Could not reach LRCLIB: ${err}` };
    }
}
