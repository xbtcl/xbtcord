/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Shared between the renderer and the main process, so both agree on what "a tracker"
 * means. Hosts are matched on the registrable suffix: an entry blocks the host itself
 * and any subdomain of it, and nothing else.
 */

export enum Category {
    /** Discord's own telemetry that survives the JS-level patches in NoTrack. */
    Discord = "discord",
    /** Crash and error reporting SDKs. */
    Crash = "crash",
    /** Product analytics and session recording. */
    Analytics = "analytics",
    /** Ad networks and attribution/conversion tracking. */
    Advertising = "advertising"
}

export const CategoryLabels: Record<Category, string> = {
    [Category.Discord]: "Discord telemetry",
    [Category.Crash]: "Crash reporters",
    [Category.Analytics]: "Analytics & session recording",
    [Category.Advertising]: "Ad networks & attribution"
};

export const HOSTS: Record<Category, string[]> = {
    // Discord's telemetry shares a host with the client itself, so it is matched by
    // path below rather than by hostname.
    [Category.Discord]: [],

    [Category.Crash]: [
        "sentry.io",
        "ingest.sentry.io",
        "sentry-cdn.com",
        "browser.sentry-cdn.com",
        "crashlytics.com",
        "bugsnag.com",
        "rollbar.com",
        "raygun.io"
    ],

    [Category.Analytics]: [
        "google-analytics.com",
        "googletagmanager.com",
        "analytics.google.com",
        "scorecardresearch.com",
        "hotjar.com",
        "hotjar.io",
        "mixpanel.com",
        "segment.io",
        "segment.com",
        "amplitude.com",
        "fullstory.com",
        "logrocket.com",
        "logrocket.io",
        "mouseflow.com",
        "clarity.ms",
        "quantserve.com",
        "chartbeat.com",
        "newrelic.com",
        "nr-data.net",
        "matomo.cloud",
        "statcounter.com",
        "yandex.ru",
        "mc.yandex.ru"
    ],

    [Category.Advertising]: [
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adnxs.com",
        "criteo.com",
        "criteo.net",
        "taboola.com",
        "outbrain.com",
        "adjust.com",
        "appsflyer.com",
        "branch.io",
        "app-measurement.com",
        "connect.facebook.net",
        "facebook.net",
        "analytics.tiktok.com",
        "bat.bing.com",
        "ads-twitter.com",
        "snap.licdn.com",
        "px.ads.linkedin.com"
    ]
};

/**
 * Discord's own telemetry lives on paths under its normal API host, so it cannot be
 * blocked by hostname without taking the whole client offline with it.
 */
export const DISCORD_TELEMETRY_PATHS = [
    /\/api\/v\d+\/science\b/,
    /\/api\/v\d+\/track\b/,
    /\/api\/v\d+\/metrics\b/,
    /\/api\/v\d+\/premium-marketing\b/,
    /\/api\/v\d+\/applications\/\d+\/analytics\b/
];

const DISCORD_HOSTS = /(^|\.)(discord\.com|discordapp\.com|discord\.gg|discordapp\.net)$/;

function hostMatches(host: string, suffix: string): boolean {
    return host === suffix || host.endsWith(`.${suffix}`);
}

export interface ShieldConfig {
    enabled: boolean;
    categories: Record<Category, boolean>;
}

/** Returns the category that blocks this URL, or null when it should be allowed through. */
export function classify(url: string, config: ShieldConfig): Category | null {
    if (!config.enabled) return null;

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    const host = parsed.hostname.toLowerCase();

    if (config.categories[Category.Discord] && DISCORD_HOSTS.test(host)) {
        if (DISCORD_TELEMETRY_PATHS.some(re => re.test(parsed.pathname))) return Category.Discord;
    }

    for (const category of [Category.Crash, Category.Analytics, Category.Advertising] as const) {
        if (!config.categories[category]) continue;
        if (HOSTS[category].some(suffix => hostMatches(host, suffix))) return category;
    }

    return null;
}

/**
 * Query parameters that exist only to identify who followed a link. Stripped from
 * URLs before they are opened, so a click doesn't hand the destination a click ID.
 */
export const TRACKING_PARAMS: (string | RegExp)[] = [
    /^utm_/i,
    /^ga_/i,
    /^pk_/i,
    /^mtm_/i,
    /^hsa_/i,
    /^vero_/i,
    /^mc_/i,
    "fbclid", "gclid", "gclsrc", "dclid", "wbraid", "gbraid", "msclkid", "twclid",
    "igshid", "igsh", "ttclid", "li_fat_id", "yclid", "rb_clickid", "s_kwcid",
    "ef_id", "_openstat", "wickedid", "oly_enc_id", "oly_anon_id", "vgo_ee",
    "epik", "sc_cid", "hsCtaTracking", "irclickid", "cjevent", "trk_contact",
    "trk_msg", "trk_module", "trk_sid", "spm", "scm", "share_source"
];

/** Returns the URL with every known tracking parameter removed. */
export function stripTrackingParams(rawUrl: string): string {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return rawUrl;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return rawUrl;

    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
        const matched = TRACKING_PARAMS.some(p =>
            typeof p === "string" ? p.toLowerCase() === key.toLowerCase() : p.test(key)
        );
        if (matched) {
            url.searchParams.delete(key);
            changed = true;
        }
    }

    if (!changed) return rawUrl;

    // Keep a bare "?" from being left behind on an otherwise clean URL.
    let out = url.toString();
    if (!url.search) out = out.replace(/\?(?=#|$)/, "");
    return out;
}
