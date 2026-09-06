/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsStore } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { PluginNative } from "@utils/types";

import { invalidateSession, logger, openXbtBrowser, warmUp } from "./BrowserModal";
import { currentConfig, shouldInterceptLinks } from "./config";
import { shouldTakeOver } from "./policy";
import { settings } from "./settings";

const Native = XbtcordNative.pluginHelpers.XbtBrowser as PluginNative<typeof import("./native")> | undefined;

/** Settings the main process needs to know about the moment they change. */
const FILTER_KEYS = [
    "blockTrackers",
    "stripParams",
    "blockThirdPartyCookies",
    "sendDoNotTrack",
    "blockDownloads",
    "persist"
] as const;

function pushConfig() {
    Native?.setConfig(currentConfig())
        .catch(err => logger.error("Couldn't update the browser's filters", err));
}

/** `persist` decides which partition the view runs in, so the warmed one is now wrong. */
function onPersistChanged() {
    invalidateSession();
    warmUp();
}

/**
 * Catches link clicks on the way down, before Discord's own handler sees them.
 *
 * A capture-phase listener rather than a webpack patch: Discord opens links from several
 * places (message content, embeds, profile fields, settings) and they do not all go
 * through one function, but every one of them is an anchor in the end.
 */
function onLinkClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    // Any modifier is the escape hatch - hold one and the link goes wherever it would
    // have gone without Xbtcord.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!shouldInterceptLinks()) return;

    const target = event.target as Element | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || !shouldTakeOver(href, location.href)) return;

    event.preventDefault();
    event.stopPropagation();
    // Discord attaches its own listeners at this level too; without this one of them
    // still runs and opens a second copy in the system browser.
    event.stopImmediatePropagation();

    openXbtBrowser(new URL(href, location.href).toString());
}

export default definePlugin({
    name: "XbtBrowser",
    description: "Xbt-Browser Protection: opens links inside Discord in an isolated browser that blocks trackers, strips tracking parameters and refuses third-party cookies",
    authors: [Devs.Xbtcord],
    tags: ["Privacy", "Utility"],
    enabledByDefault: true,
    settings,

    start() {
        // Prepares the filtered session now, so clicking a link has nothing to wait for.
        warmUp();

        for (const key of FILTER_KEYS) {
            SettingsStore.addChangeListener(`plugins.XbtBrowser.${key}` as any, pushConfig);
        }
        SettingsStore.addChangeListener("plugins.XbtBrowser.persist" as any, onPersistChanged);

        document.addEventListener("click", onLinkClick, true);
    },

    stop() {
        document.removeEventListener("click", onLinkClick, true);
        for (const key of FILTER_KEYS) {
            SettingsStore.removeChangeListener(`plugins.XbtBrowser.${key}` as any, pushConfig);
        }
        SettingsStore.removeChangeListener("plugins.XbtBrowser.persist" as any, onPersistChanged);
    }
});
