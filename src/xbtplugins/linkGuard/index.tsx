/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts } from "@webpack/common";

import { IMPERSONATED_BRANDS, LOGGER_DOMAINS, SHORTENER_DOMAINS } from "./blocklist";

const logger = new Logger("LinkGuard");

const settings = definePluginSettings({
    blockLoggers: {
        type: OptionType.BOOLEAN,
        description: "Warn before opening known IP logger / grabber links",
        default: true
    },
    warnLookalikes: {
        type: OptionType.BOOLEAN,
        description: "Warn when a domain is one or two characters away from a commonly faked one (disc0rd.com, steamcommunlty.com)",
        default: true
    },
    warnShorteners: {
        type: OptionType.BOOLEAN,
        description: "Warn on link shorteners, which hide where they actually go",
        default: false
    },
    extraDomains: {
        type: OptionType.STRING,
        description: "Extra domains to warn about, comma separated",
        default: ""
    },
    allowedDomains: {
        type: OptionType.STRING,
        description: "Domains to never warn about, comma separated",
        default: ""
    }
});

function list(raw: string) {
    return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** `a.b.example.com` matches an entry of `example.com`, but `notexample.com` does not. */
function matches(host: string, domain: string) {
    return host === domain || host.endsWith(`.${domain}`);
}

/** Cheap edit distance, capped - we only care whether it is 1 or 2. */
function editDistance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 99;

    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        previous = current;
    }
    return previous[b.length];
}

export interface Verdict {
    reason: string;
    detail: string;
}

export function inspect(url: string): Verdict | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (list(settings.store.allowedDomains).some(d => matches(host, d))) return null;

    if (settings.store.blockLoggers && LOGGER_DOMAINS.some(d => matches(host, d))) {
        return {
            reason: "This is a known IP logger",
            detail: `${host} exists to record who opens it - your IP address, your rough location and your browser - and then forward you on to whatever was promised. Opening it tells whoever sent it where you are.`
        };
    }

    if (list(settings.store.extraDomains).some(d => matches(host, d))) {
        return {
            reason: "You asked to be warned about this domain",
            detail: `${host} is on your own warn list.`
        };
    }

    if (settings.store.warnShorteners && SHORTENER_DOMAINS.some(d => matches(host, d))) {
        return {
            reason: "This is a shortened link",
            detail: `${host} hides where it actually sends you until you have already gone there.`
        };
    }

    if (settings.store.warnLookalikes) {
        const brand = IMPERSONATED_BRANDS.find(b => b !== host && !host.endsWith(`.${b}`) && editDistance(host, b) <= 2);
        if (brand) {
            return {
                reason: "This domain is impersonating another one",
                detail: `${host} is a couple of characters away from ${brand}. That is how login pages get faked.`
            };
        }
    }

    return null;
}

function confirm(url: string, verdict: Verdict, proceed: () => void) {
    Alerts.show({
        title: verdict.reason,
        body: (
            <>
                <p>{verdict.detail}</p>
                <p style={{ wordBreak: "break-all", opacity: 0.75, marginTop: 8 }}>{url}</p>
                <p style={{ marginTop: 8 }}>
                    Worth knowing: nothing here can hide your IP if you do open it. Once you connect,
                    the other end has your address. The only protection is not going.
                </p>
            </>
        ),
        confirmText: "Open anyway",
        cancelText: "Don't open",
        onConfirm: proceed
    });
}

/** Desktop hands links to the OS browser; the web build has to use window.open. */
function open(url: string) {
    if (IS_DISCORD_DESKTOP || IS_VESKTOP) XbtcordNative.native.openExternal(url);
    else window.open(url, "_blank", "noreferrer,noopener");
}

/**
 * Clicks are caught in the capture phase on the window, which runs before Discord's own
 * handlers get a chance to open the link. Nothing here patches Discord internals, so it
 * keeps working across client updates.
 */
function onClick(event: MouseEvent) {
    try {
        if (event.defaultPrevented || event.button !== 0) return;

        const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return;

        const url = anchor.href;
        const verdict = inspect(url);
        if (!verdict) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        confirm(url, verdict, () => open(url));
    } catch (err) {
        logger.error("Failed while checking a link", err);
    }
}

export default definePlugin({
    name: "LinkGuard",
    description: "Warns you before opening IP logger links and domains dressed up as somewhere else",
    tags: ["Privacy", "Utility"],
    searchTerms: ["grabify", "iplogger", "ip", "logger", "grabber", "phishing", "safety", "link"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        window.addEventListener("click", onClick, true);
    },

    stop() {
        window.removeEventListener("click", onClick, true);
    }
});
