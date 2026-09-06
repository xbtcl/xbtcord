/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

/**
 * The catalogue fetch has to happen here, in the main process, rather than in the
 * renderer where the rest of the plugin lives.
 *
 * The BetterDiscord store API answers with no `Access-Control-Allow-Origin` header at
 * all, so a `fetch` from Discord's origin gets its response withheld by CORS and fails
 * with a bare "TypeError: Failed to fetch" - no CSP violation, nothing in the console
 * to point at the cause. Main-process requests aren't subject to CORS, so the fetch
 * simply works here.
 *
 * Thumbnails stay in the renderer: `<img src>` is not a CORS-checked load, and
 * betterdiscord.app is already allowed for `img-src` in the CSP policy list.
 */

const STORE_API = "https://api.betterdiscord.app/v3/store/addons";

/** Matches the fields `api.ts` normalises; anything else is dropped before it crosses IPC. */
export interface RawTheme {
    id: number;
    type: string;
    name: string;
    file_name: string;
    description: string;
    version: string;
    author: { display_name: string; discord_snowflake: string; };
    likes: string;
    downloads: number;
    tags: string[];
    thumbnail_url: string | null;
    latest_source_url: string;
    initial_release_date: string;
    latest_release_date: string;
}

export async function fetchThemes(_: IpcMainInvokeEvent): Promise<RawTheme[]> {
    const res = await fetch(STORE_API, {
        headers: {
            Accept: "application/json",
            // The store is a public endpoint, but identifying the client is polite and
            // makes Xbtcord's traffic legible to them if it ever needs to be.
            "User-Agent": "Xbtcord (https://github.com/Xbtcord/Xbtcord)"
        }
    });

    if (!res.ok) throw new Error(`BetterDiscord store returned ${res.status} ${res.statusText}`);

    const addons = await res.json();
    if (!Array.isArray(addons)) throw new Error("BetterDiscord store returned an unexpected payload");

    // Filtering here rather than in the renderer keeps ~200 plugin entries - most of the
    // 290KB response - from crossing the IPC boundary for no reason.
    return addons.filter((a: RawTheme) =>
        a?.type === "theme" && typeof a.latest_source_url === "string" && a.latest_source_url
    );
}
