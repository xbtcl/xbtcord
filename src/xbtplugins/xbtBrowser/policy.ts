/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Rules shared by both halves of XbtBrowser: the renderer, which decides which clicks to
 * take over, and the main process, which decides what the isolated session is allowed to
 * request. Keeping them in one file is the only way the two stay in agreement.
 *
 * Nothing here may import electron - this module is bundled into the renderer too.
 */

/**
 * The browsing session lives in its own Electron partition, so it shares no cookies,
 * storage or cache with Discord. Without the `persist:` prefix the partition is held in
 * memory only and everything in it is gone when Discord quits, which is the default:
 * a link previewer has no business accumulating a cookie jar.
 */
export const PARTITION_EPHEMERAL = "xbtcord-browser";
export const PARTITION_PERSISTENT = "persist:xbtcord-browser";

export function partitionFor(persist: boolean): string {
    return persist ? PARTITION_PERSISTENT : PARTITION_EPHEMERAL;
}

/** What the main process needs to know to filter the session. Mirrors the plugin settings. */
export interface BrowserConfig {
    persist: boolean;
    blockTrackers: boolean;
    stripParams: boolean;
    blockThirdPartyCookies: boolean;
    sendDoNotTrack: boolean;
    blockDownloads: boolean;
}

/** Counters for one page view, so the UI can say what it actually stopped. */
export interface BrowserStats {
    blocked: number;
    stripped: number;
    cookiesBlocked: number;
    /** Set when a download was refused, so the UI can offer to hand it to the real browser. */
    blockedDownload: string | null;
    topHosts: { host: string; count: number; }[];
}

export const EMPTY_STATS: BrowserStats = {
    blocked: 0,
    stripped: 0,
    cookiesBlocked: 0,
    blockedDownload: null,
    topHosts: []
};

/**
 * Discord's own hosts. Links to these are left alone - an invite, a channel link, a CDN
 * attachment or a support article is Discord's to handle, and taking those over would
 * break navigation inside the app for no privacy gain.
 */
const DISCORD_HOSTS = /(^|\.)(discord\.com|discordapp\.com|discord\.gg|discord\.media|discordapp\.net|discord\.dev|discordstatus\.com)$/;

/** True when this URL is one XbtBrowser should open rather than the system browser. */
export function shouldTakeOver(rawUrl: string, base?: string): boolean {
    const url = parseUrl(rawUrl, base);
    if (!url) return false;
    if (!isWebProtocol(url.protocol)) return false;
    return !DISCORD_HOSTS.test(url.hostname.toLowerCase());
}

export function isWebProtocol(protocol: string): boolean {
    return protocol === "http:" || protocol === "https:";
}

export function parseUrl(rawUrl: string, base?: string): URL | null {
    try {
        return new URL(rawUrl, base);
    } catch {
        return null;
    }
}

/**
 * A short list of two-label public suffixes.
 *
 * Proper same-site comparison needs the Public Suffix List, which is a megabyte of data
 * updated weekly - far too much to carry for this. The approximation errs on the side of
 * calling things third-party (so they get filtered) rather than first-party, which is the
 * safe direction to be wrong in: the cost is an occasional missing cookie on an unusual
 * domain, not a leak.
 */
const TWO_LABEL_SUFFIXES = new Set([
    "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk",
    "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
    "com.au", "net.au", "org.au", "edu.au", "gov.au",
    "com.br", "com.cn", "com.mx", "com.tr", "com.tw", "com.ar", "com.sg", "com.hk",
    "co.nz", "co.za", "co.in", "co.kr", "co.il", "co.id", "co.th"
]);

/**
 * The registrable part of a hostname - roughly "the bit you buy from a registrar".
 * `docs.example.co.uk` gives `example.co.uk`; `a.b.example.com` gives `example.com`.
 */
export function registrableDomain(hostname: string): string {
    const labels = hostname.toLowerCase().split(".");
    if (labels.length <= 2) return labels.join(".");

    const lastTwo = labels.slice(-2).join(".");
    if (TWO_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
        return labels.slice(-3).join(".");
    }

    return lastTwo;
}

/** True when `requestUrl` belongs to a different site than the page that asked for it. */
export function isThirdParty(requestUrl: string, topUrl: string): boolean {
    const request = parseUrl(requestUrl);
    const top = parseUrl(topUrl);
    if (!request || !top) return false;

    return registrableDomain(request.hostname) !== registrableDomain(top.hostname);
}

export const SEARCH_ENGINES = {
    duckduckgo: { name: "DuckDuckGo", home: "https://duckduckgo.com/", query: "https://duckduckgo.com/?q=" },
    startpage: { name: "Startpage", home: "https://www.startpage.com/", query: "https://www.startpage.com/sp/search?query=" },
    google: { name: "Google", home: "https://www.google.com/", query: "https://www.google.com/search?q=" },
    bing: { name: "Bing", home: "https://www.bing.com/", query: "https://www.bing.com/search?q=" }
} as const;

export type SearchEngine = keyof typeof SEARCH_ENGINES;

/** Anything with a scheme already. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** `example.com`, `example.com/path`, `localhost:3000` - things meant as addresses. */
const LOOKS_LIKE_HOST = /^[^\s/?#@]+\.[a-z]{2,}(?:[:/?#]|$)/i;
const LOOKS_LIKE_LOCALHOST = /^localhost(?::\d+)?(?:[/?#]|$)/i;

/**
 * Turns whatever was typed in the address bar into something navigable: a URL if it reads
 * like one, a search otherwise. Same behaviour as any browser's omnibox.
 */
export function toNavigableUrl(input: string, engine: SearchEngine): string | null {
    const text = input.trim();
    if (!text) return null;

    if (HAS_SCHEME.test(text)) {
        const url = parseUrl(text);
        // A scheme we won't open still gets searched for rather than silently dropped.
        return url && isWebProtocol(url.protocol) ? url.toString() : searchUrl(text, engine);
    }

    if (LOOKS_LIKE_HOST.test(text) || LOOKS_LIKE_LOCALHOST.test(text)) {
        const url = parseUrl(`https://${text}`);
        if (url) return url.toString();
    }

    return searchUrl(text, engine);
}

export function searchUrl(query: string, engine: SearchEngine): string {
    const { query: prefix } = SEARCH_ENGINES[engine] ?? SEARCH_ENGINES.duckduckgo;
    return prefix + encodeURIComponent(query);
}

/** The address as it should read in the bar: readable, without the noise a browser hides. */
export function displayUrl(rawUrl: string): string {
    const url = parseUrl(rawUrl);
    if (!url) return rawUrl;

    return decodeURI(url.toString());
}
