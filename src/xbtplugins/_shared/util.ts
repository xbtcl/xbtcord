/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, NavigationRouter } from "@webpack/common";

/**
 * Parses the loose durations people actually type: `10m`, `2h30m`, `1d`, `90`.
 *
 * A bare number means minutes, because that is what someone typing "30" into a box
 * labelled "remind me in" means. Returns null rather than throwing so callers can
 * show their own message.
 */
export function parseDuration(input: string): number | null {
    const text = input.trim().toLowerCase();
    if (!text) return null;

    if (/^\d+(\.\d+)?$/.test(text)) return Math.round(parseFloat(text) * 60_000);

    const units: Record<string, number> = {
        s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
        m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
        h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
        d: 86_400_000, day: 86_400_000, days: 86_400_000,
        w: 604_800_000, week: 604_800_000, weeks: 604_800_000
    };

    let total = 0;
    let matched = false;
    for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
        const ms = units[unit];
        if (ms == null) return null;
        total += parseFloat(amount) * ms;
        matched = true;
    }

    return matched ? Math.round(total) : null;
}

/** `2h 15m`, for showing a duration back to the user. */
export function formatDuration(ms: number): string {
    if (ms < 0) ms = 0;
    const units: [string, number][] = [["d", 86_400_000], ["h", 3_600_000], ["m", 60_000], ["s", 1000]];

    const parts: string[] = [];
    for (const [label, size] of units) {
        const value = Math.floor(ms / size);
        if (value > 0) parts.push(`${value}${label}`);
        ms -= value * size;
        if (parts.length === 2) break;
    }

    return parts.join(" ") || "0s";
}

/**
 * setTimeout, but for delays longer than ~24.8 days.
 *
 * Anything over 2^31-1 ms overflows the internal 32-bit counter and fires immediately
 * instead, which for a "remind me next month" is the difference between working and
 * firing the instant you set it. Chaining keeps the long waits honest.
 */
const MAX_TIMEOUT = 2_147_483_647;

export function setLongTimeout(fn: () => void, delay: number): () => void {
    let handle: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const arm = (remaining: number) => {
        handle = setTimeout(() => {
            if (cancelled) return;
            if (remaining > MAX_TIMEOUT) arm(remaining - MAX_TIMEOUT);
            else fn();
        }, Math.min(remaining, MAX_TIMEOUT));
    };

    arm(Math.max(0, delay));

    return () => {
        cancelled = true;
        clearTimeout(handle);
    };
}

/** Opens the given message, wherever it lives. */
export function jumpToMessage(channelId: string, messageId?: string) {
    const guildId = ChannelStore.getChannel(channelId)?.guild_id ?? "@me";
    NavigationRouter.transitionTo(`/channels/${guildId}/${channelId}${messageId ? `/${messageId}` : ""}`);
}

/** A user-facing name for a channel, for notification titles and list rows. */
export function describeChannel(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "a channel";
    if (channel.name) return `#${channel.name}`;
    return channel.rawRecipients?.map(r => r.username).join(", ") || "a DM";
}
