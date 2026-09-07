/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    from: {
        type: OptionType.STRING,
        description: "Quiet from, as a 24 hour local time",
        default: "23:00"
    },
    until: {
        type: OptionType.STRING,
        description: "Quiet until, as a 24 hour local time",
        default: "08:00"
    },
    digest: {
        type: OptionType.BOOLEAN,
        description: "Tell you how many you missed once it is over",
        default: true
    },
    announce: {
        type: OptionType.BOOLEAN,
        description: "Say so when quiet hours start and end",
        default: true
    }
});

function minutesOf(text: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
}

/** Handles the usual case, where quiet hours run past midnight. */
export function isQuietNow(now = new Date()): boolean {
    const from = minutesOf(settings.store.from);
    const until = minutesOf(settings.store.until);
    if (from == null || until == null || from === until) return false;

    const current = now.getHours() * 60 + now.getMinutes();
    return from < until
        ? current >= from && current < until
        : current >= from || current < until;
}

let quiet = false;
let missed = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let original: typeof window.Notification | undefined;

/*
 * Every desktop notification in this client - Discord's own, and the ones Xbtcord plugins
 * raise through the Notifications API - ends up at `new Notification(...)`. Swapping that
 * constructor out is one small, entirely reversible change that catches all of them, and
 * it does not touch your notification settings, which sync to every device you own and
 * would still be wrong in the morning.
 *
 * Toasts, badges and the unread dots are all left alone on purpose. The point is to stop
 * the machine making noise at 3am, not to hide that anything happened.
 */
function install() {
    if (original) return;
    original = window.Notification;

    const Silent = function (this: any, ..._args: any[]) {
        missed++;
        return { close() { }, onclick: null, onclose: null, onerror: null, onshow: null } as any;
    } as unknown as typeof window.Notification;

    // Discord checks permission and requestPermission before it constructs anything, so
    // the replacement has to answer those the same way the real one would.
    Object.defineProperty(Silent, "permission", { get: () => original!.permission, configurable: true });
    Silent.requestPermission = original.requestPermission.bind(original);

    window.Notification = Silent;
}

function restore() {
    if (!original) return;
    window.Notification = original;
    original = undefined;
}

function tick() {
    const nowQuiet = isQuietNow();
    if (nowQuiet === quiet) return;

    quiet = nowQuiet;

    if (quiet) {
        missed = 0;
        install();
        if (settings.store.announce) showToast("Quiet hours on - notifications are silenced", Toasts.Type.MESSAGE);
        return;
    }

    restore();

    if (settings.store.digest && missed > 0) {
        showNotification({
            title: "Quiet hours are over",
            body: `${missed} notification${missed === 1 ? "" : "s"} came in while you were asleep.`
        });
    } else if (settings.store.announce) {
        showToast("Quiet hours over", Toasts.Type.MESSAGE);
    }

    missed = 0;
}

export default definePlugin({
    name: "QuietHours",
    description: "Silences every desktop notification between the hours you pick, and tells you how many you missed in the morning",
    tags: ["Notifications", "Utility"],
    searchTerms: ["quiet", "night", "sleep", "notifications", "schedule", "silence", "mute"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        quiet = isQuietNow();
        if (quiet) install();

        // A minute is plenty: the boundary is a wall clock time, and nobody notices it
        // arriving thirty seconds late.
        timer = setInterval(tick, 60_000);
    },

    stop() {
        clearInterval(timer);
        restore();
        quiet = false;
        missed = 0;
    }
});
