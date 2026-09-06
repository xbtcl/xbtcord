/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";

export const logger = new Logger("ThemeVault", "#a78bfa");

/**
 * The catalogue is fetched by the main process, not from here - the BetterDiscord store
 * sends no `Access-Control-Allow-Origin`, so a renderer-side fetch is refused by CORS.
 * See `native.ts` for the details.
 */
const Native = XbtcordNative.pluginHelpers.ThemeVault as PluginNative<typeof import("./native")>;

/** Thumbnails come back as a site-relative path like `/image/1617`. */
const SITE_BASE = "https://betterdiscord.app";

const CACHE_KEY = "Xbtcord_ThemeVault_Catalogue";
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h - the store publishes on a human cadence, not a live one

export interface BdAuthor {
    github_id: string;
    github_name: string;
    display_name: string;
    discord_name: string;
    discord_avatar_hash: string | null;
    discord_snowflake: string;
}

export interface BdAddon {
    id: number;
    type: "plugin" | "theme";
    name: string;
    file_name: string;
    description: string;
    version: string;
    author: BdAuthor;
    /** The API sends likes as a string ("307") while downloads is a number. */
    likes: string;
    downloads: number;
    tags: string[];
    thumbnail_url: string | null;
    latest_source_url: string;
    initial_release_date: string;
    latest_release_date: string;
}

/** A theme, normalised so no consumer has to carry the API's quirks. */
export interface VaultTheme {
    id: number;
    name: string;
    fileName: string;
    description: string;
    version: string;
    author: string;
    authorId: string;
    likes: number;
    downloads: number;
    tags: string[];
    /** Absolute thumbnail URL, or null when the theme ships without one. */
    thumbnail: string | null;
    /** Raw CSS URL - this is what gets imported when the theme is switched on. */
    source: string;
    released: number;
    updated: number;
}

interface CachedCatalogue {
    fetchedAt: number;
    themes: VaultTheme[];
}

function normalise(addon: BdAddon): VaultTheme {
    return {
        id: addon.id,
        name: addon.name,
        fileName: addon.file_name,
        description: addon.description ?? "",
        version: addon.version ?? "",
        author: addon.author?.display_name ?? "unknown",
        authorId: addon.author?.discord_snowflake ?? "",
        likes: Number(addon.likes) || 0,
        downloads: addon.downloads ?? 0,
        tags: addon.tags ?? [],
        thumbnail: addon.thumbnail_url ? `${SITE_BASE}${addon.thumbnail_url}` : null,
        source: addon.latest_source_url,
        released: Date.parse(addon.initial_release_date) || 0,
        updated: Date.parse(addon.latest_release_date) || 0
    };
}

async function fetchCatalogue(): Promise<VaultTheme[]> {
    if (!Native?.fetchThemes) {
        // Web/browser builds have no main process to fetch through, and the store's
        // missing CORS headers make a direct request impossible from a page.
        throw new Error("The theme store is only available in the desktop app");
    }

    const addons = await Native.fetchThemes() as BdAddon[];
    if (!Array.isArray(addons)) throw new Error("BetterDiscord store returned an unexpected payload");

    return addons.map(normalise);
}

/**
 * Returns the theme catalogue, preferring a fresh network copy and falling back to
 * the last good cache. A stale cache beats an empty grid: themes the user already
 * enabled keep rendering with their real names even when the store is unreachable.
 */
export async function getThemes(forceRefresh = false): Promise<{ themes: VaultTheme[]; stale: boolean; }> {
    const cached = await DataStore.get<CachedCatalogue>(CACHE_KEY);

    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return { themes: cached.themes, stale: false };
    }

    try {
        const themes = await fetchCatalogue();
        await DataStore.set(CACHE_KEY, { fetchedAt: Date.now(), themes } satisfies CachedCatalogue);
        return { themes, stale: false };
    } catch (err) {
        logger.error("Failed to fetch the BetterDiscord theme catalogue", err);
        if (cached) return { themes: cached.themes, stale: true };
        throw err;
    }
}

/**
 * The cached catalogue only, with no network call.
 *
 * The Themes tab uses this to put a name and an author against the URLs sitting in
 * `themeLinks`. It must never fetch: that tab opens constantly, and a settings page that
 * hits the BetterDiscord store every time you glance at it would be both slow and rude.
 * An empty result simply means those links render as plain URLs, which is what they did
 * before.
 */
export async function getCachedThemes(): Promise<VaultTheme[]> {
    try {
        return (await DataStore.get<CachedCatalogue>(CACHE_KEY))?.themes ?? [];
    } catch {
        return [];
    }
}

/** Every tag present in the catalogue, most common first. */
export function collectTags(themes: VaultTheme[]): string[] {
    const counts = new Map<string, number>();
    for (const theme of themes) {
        for (const tag of theme.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag);
}
