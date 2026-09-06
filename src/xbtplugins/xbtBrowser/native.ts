/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Category, classify, ShieldConfig, stripTrackingParams } from "@xbtplugins/_shared/blocklist";
import { IpcMainInvokeEvent, session, shell, WebContents } from "electron";

import { BrowserConfig, BrowserStats, EMPTY_STATS, isThirdParty, isWebProtocol, parseUrl, partitionFor } from "./policy";

/**
 * The filtering half of XbtBrowser.
 *
 * Everything here runs in the main process for the same reason XbtShield does: a request
 * cancelled at the network layer never leaves the machine, whereas anything done inside
 * the page can be undone by the page. The page being browsed is hostile by assumption -
 * that is the entire point of putting it in a sandbox - so nothing about the filtering
 * is left in its reach.
 */

let config: BrowserConfig = {
    persist: false,
    blockTrackers: true,
    stripParams: true,
    blockThirdPartyCookies: true,
    sendDoNotTrack: true,
    blockDownloads: true
};

/**
 * Every tracker category, always - this browser has no reason to relax any of them.
 * Held as one frozen object rather than rebuilt per request: this is read on the hot path
 * for every subresource of every page.
 */
const SHIELD: ShieldConfig = {
    enabled: true,
    categories: {
        [Category.Discord]: true,
        [Category.Crash]: true,
        [Category.Analytics]: true,
        [Category.Advertising]: true
    }
};

interface GuestStats {
    blocked: number;
    stripped: number;
    cookiesBlocked: number;
    blockedDownload: string | null;
    hosts: Record<string, number>;
}

/** Per-guest counters, keyed by the guest's webContents id. */
const stats = new Map<number, GuestStats>();
/**
 * The top-level URL each guest is currently showing. Tracked here rather than looked up
 * through `webContents.fromId` on every request, because this runs on the hot path for
 * every subresource a page loads.
 */
const topUrls = new Map<number, string>();

const installedPartitions = new Set<string>();
const hardenedHosts = new WeakSet<WebContents>();

function statsFor(id: number): GuestStats {
    let entry = stats.get(id);
    if (!entry) {
        entry = { blocked: 0, stripped: 0, cookiesBlocked: 0, blockedDownload: null, hosts: {} };
        stats.set(id, entry);
    }
    return entry;
}

function forget(id: number) {
    stats.delete(id);
    topUrls.delete(id);
}

/**
 * Discord's user agent names both Discord and Electron, which is a loud fingerprint and
 * makes a fair number of sites refuse to render at all. Stripping those two tokens leaves
 * the plain Chrome string underneath - less identifying and more compatible at once.
 */
function browsingUserAgent(): string {
    return session.defaultSession.getUserAgent()
        .replace(/\s*(?:disc|Disc)ord\/\S+/g, "")
        .replace(/\s*Electron\/\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function install(partition: string) {
    if (installedPartitions.has(partition)) return;
    installedPartitions.add(partition);

    const ses = session.fromPartition(partition);

    ses.setUserAgent(browsingUserAgent());

    ses.webRequest.onBeforeRequest((details, callback) => {
        const id = details.webContentsId ?? -1;

        if (details.resourceType === "mainFrame") topUrls.set(id, details.url);

        if (config.blockTrackers) {
            const category = classify(details.url, SHIELD);
            if (category != null) {
                const entry = statsFor(id);
                entry.blocked++;
                const parsed = parseUrl(details.url);
                if (parsed) entry.hosts[parsed.hostname] = (entry.hosts[parsed.hostname] ?? 0) + 1;

                callback({ cancel: true });
                return;
            }
        }

        // Only GETs are redirected: a redirect turns a POST into a GET, which would break
        // any form whose action URL happened to carry a tracking parameter.
        if (config.stripParams && details.method === "GET") {
            const clean = stripTrackingParams(details.url);
            if (clean !== details.url) {
                statsFor(id).stripped++;
                // stripTrackingParams is idempotent, so the redirected request comes back
                // through here unchanged and passes rather than looping.
                callback({ cancel: false, redirectURL: clean });
                return;
            }
        }

        callback({ cancel: false });
    });

    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders };

        if (config.sendDoNotTrack) {
            headers.DNT = "1";
            headers["Sec-GPC"] = "1";
        }

        const top = topUrls.get(details.webContentsId ?? -1);
        if (top != null && isThirdParty(details.url, top)) {
            if (config.blockThirdPartyCookies) {
                for (const key of Object.keys(headers)) {
                    if (key.toLowerCase() === "cookie") delete headers[key];
                }
            }

            // Referer is downgraded to the bare origin rather than dropped. Dropping it
            // breaks hotlink protection on a lot of CDNs, and the path is the part that
            // actually leaks what you were reading.
            for (const key of Object.keys(headers)) {
                if (key.toLowerCase() !== "referer") continue;
                const referer = parseUrl(String(headers[key]));
                if (referer) headers[key] = `${referer.origin}/`;
                else delete headers[key];
            }
        }

        callback({ cancel: false, requestHeaders: headers });
    });

    ses.webRequest.onHeadersReceived((details, callback) => {
        const { responseHeaders } = details;
        if (!responseHeaders || !config.blockThirdPartyCookies) {
            callback({ cancel: false, responseHeaders });
            return;
        }

        const id = details.webContentsId ?? -1;
        const top = topUrls.get(id);
        if (top == null || !isThirdParty(details.url, top)) {
            callback({ cancel: false, responseHeaders });
            return;
        }

        const next = { ...responseHeaders };
        let removed = false;
        for (const key of Object.keys(next)) {
            if (key.toLowerCase() === "set-cookie") {
                delete next[key];
                removed = true;
            }
        }
        if (removed) statsFor(id).cookiesBlocked++;

        callback({ cancel: false, responseHeaders: next });
    });

    // A sandboxed view has no business reaching hardware or sending notifications, and
    // nothing it could legitimately want is worth the prompt. Both handlers are needed:
    // the request handler covers asking, the check handler covers silent querying.
    ses.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);

    ses.on("will-download", (event, item, guest) => {
        if (!config.blockDownloads) return;

        event.preventDefault();
        statsFor(guest?.id ?? -1).blockedDownload = item.getURL();
    });
}

/**
 * Locks down webviews attached to this window.
 *
 * The window-open handler is the important one: without it a `target="_blank"` link
 * inside the sandbox would ask for a real window, which Discord's own handler turns into
 * a system browser tab - straight back out of the isolation the user asked for. Loading
 * it in the same view instead keeps the whole journey inside XbtBrowser.
 */
function hardenHost(host: WebContents) {
    if (hardenedHosts.has(host)) return;
    hardenedHosts.add(host);

    host.on("did-attach-webview", (_event, guest) => {
        guest.setWindowOpenHandler(({ url }) => {
            const parsed = parseUrl(url);
            if (parsed && isWebProtocol(parsed.protocol)) guest.loadURL(url);
            return { action: "deny" };
        });

        // The guest may only ever be on the web. A page that tries to walk it to file://
        // or some registered app protocol is trying to get out, not to navigate.
        const denyNonWeb = (event: Electron.Event, url: string) => {
            const parsed = parseUrl(url);
            if (!parsed || !isWebProtocol(parsed.protocol)) event.preventDefault();
        };
        guest.on("will-navigate", denyNonWeb);
        guest.on("will-redirect", denyNonWeb);

        const { id } = guest;
        guest.once("destroyed", () => forget(id));
    });

    host.once("destroyed", () => hardenedHosts.delete(host));
}

/**
 * Called before a view is created. Returns what the renderer needs to build the element,
 * and makes sure the session behind that partition is filtered before anything loads.
 */
export async function prepare(event: IpcMainInvokeEvent, next: BrowserConfig) {
    config = next;

    const partition = partitionFor(next.persist);
    install(partition);
    hardenHost(event.sender);

    return { partition, userAgent: browsingUserAgent() };
}

/** Pushes a settings change to an already-running session. */
export async function setConfig(_: IpcMainInvokeEvent, next: BrowserConfig) {
    config = next;
    install(partitionFor(next.persist));
}

export async function getStats(_: IpcMainInvokeEvent, guestId: number): Promise<BrowserStats> {
    const entry = stats.get(guestId);
    if (!entry) return EMPTY_STATS;

    return {
        blocked: entry.blocked,
        stripped: entry.stripped,
        cookiesBlocked: entry.cookiesBlocked,
        blockedDownload: entry.blockedDownload,
        topHosts: Object.entries(entry.hosts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([host, count]) => ({ host, count }))
    };
}

/** Clears the "a download was refused" flag once the UI has shown it. */
export async function acknowledgeDownload(_: IpcMainInvokeEvent, guestId: number) {
    const entry = stats.get(guestId);
    if (entry) entry.blockedDownload = null;
}

/** Wipes everything the browsing session has accumulated - cookies, storage and cache. */
export async function clearBrowsingData(_: IpcMainInvokeEvent) {
    for (const partition of [partitionFor(true), partitionFor(false)]) {
        const ses = session.fromPartition(partition);
        await ses.clearStorageData();
        await ses.clearCache();
    }

    stats.clear();
}

/**
 * Hands a URL to the real browser. Guarded by protocol: `shell.openExternal` will launch
 * whatever application claims a scheme, so it must never be handed an arbitrary one.
 */
export async function openExternally(_: IpcMainInvokeEvent, url: string) {
    const parsed = parseUrl(url);
    if (!parsed || !isWebProtocol(parsed.protocol)) return false;

    await shell.openExternal(parsed.toString());
    return true;
}
