/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

import { BrowserConfig, SEARCH_ENGINES,SearchEngine } from "./policy";

/**
 * Settings are read through `Settings.plugins` rather than through the plugin's own
 * settings object so that the modal doesn't have to import the settings module, which
 * imports the modal back for its action buttons. Same values, no import cycle.
 *
 * Every read falls back to the default here, so a half-written settings file or a fresh
 * install can never leave the browser running with protection silently off.
 */

export const DEFAULTS = {
    interceptLinks: true,
    blockTrackers: true,
    stripParams: true,
    blockThirdPartyCookies: true,
    sendDoNotTrack: true,
    blockDownloads: true,
    persist: false,
    searchEngine: "duckduckgo" as SearchEngine
};

function read<K extends keyof typeof DEFAULTS>(key: K): (typeof DEFAULTS)[K] {
    return (Settings.plugins?.XbtBrowser?.[key] ?? DEFAULTS[key]) as (typeof DEFAULTS)[K];
}

/** The subset the main process needs to filter the session. */
export function currentConfig(): BrowserConfig {
    return {
        persist: read("persist"),
        blockTrackers: read("blockTrackers"),
        stripParams: read("stripParams"),
        blockThirdPartyCookies: read("blockThirdPartyCookies"),
        sendDoNotTrack: read("sendDoNotTrack"),
        blockDownloads: read("blockDownloads")
    };
}

export function shouldInterceptLinks(): boolean {
    return read("interceptLinks");
}

export function searchEngine(): SearchEngine {
    const engine = read("searchEngine");
    return engine in SEARCH_ENGINES ? engine : "duckduckgo";
}
