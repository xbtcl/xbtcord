/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, RestAPI, showToast, Toasts } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { formatDuration, setLongTimeout } from "@xbtplugins/_shared/util";

const logger = new Logger("ChannelMuteTimer");

interface Muted {
    guildId: string;
    channelId: string;
    name: string;
    until: number;
}

const muted = new PersistedRecord<Muted>("Xbtcord_ChannelMuteTimer");
const timers = new Map<string, () => void>();

const PRESETS: [string, number][] = [
    ["15 minutes", 15 * 60_000],
    ["1 hour", 60 * 60_000],
    ["3 hours", 3 * 60 * 60_000],
    ["8 hours", 8 * 60 * 60_000],
    ["Until tomorrow", 24 * 60 * 60_000]
];

/*
 * Discord itself only offers 15 minutes, an hour, 3 hours, 8 hours, 24 hours and forever,
 * and only from the mute submenu. This writes the same user guild setting through the
 * same endpoint the client uses, so what it does is indistinguishable from muting by
 * hand - the unmute is ours, on a timer, rather than Discord's own mute_config.
 */
async function setMuted(guildId: string, channelId: string, value: boolean) {
    await RestAPI.patch({
        url: `/users/@me/guilds/${guildId}/settings`,
        body: {
            channel_overrides: {
                [channelId]: { muted: value, message_notifications: value ? 2 : 3 }
            }
        }
    });
}

async function unmute(channelId: string) {
    const entry = muted.get(channelId);
    timers.get(channelId)?.();
    timers.delete(channelId);
    muted.delete(channelId);

    if (!entry) return;

    try {
        await setMuted(entry.guildId, channelId, false);
        showToast(`${entry.name} is unmuted again`, Toasts.Type.MESSAGE);
    } catch (err) {
        logger.error("Could not unmute", err);
        showToast(`Could not unmute ${entry.name} - do it by hand`, Toasts.Type.FAILURE);
    }
}

function schedule(entry: Muted) {
    timers.get(entry.channelId)?.();
    timers.set(entry.channelId, setLongTimeout(() => unmute(entry.channelId), entry.until - Date.now()));
}

async function muteFor(guildId: string, channelId: string, name: string, ms: number) {
    try {
        await setMuted(guildId, channelId, true);
    } catch (err) {
        logger.error("Could not mute", err);
        showToast("Discord refused to mute that channel", Toasts.Type.FAILURE);
        return;
    }

    const entry: Muted = { guildId, channelId, name, until: Date.now() + ms };
    muted.set(channelId, entry);
    schedule(entry);

    showToast(`${name} is muted for ${formatDuration(ms)}`, Toasts.Type.SUCCESS);
}

export default definePlugin({
    name: "ChannelMuteTimer",
    description: "Mutes a channel for as long as you like and unmutes it again by itself, including after a restart",
    tags: ["Utility", "Notifications", "Servers"],
    searchTerms: ["mute", "timer", "temporary", "silence", "channel", "unmute"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: { id: string; guild_id?: string; name?: string; }; }) => {
            if (!channel?.guild_id) return;

            const active = muted.get(channel.id);
            const name = channel.name ? `#${channel.name}` : "this channel";

            children.push(
                active
                    ? <Menu.MenuItem
                        id="xbt-mute-timer-cancel"
                        label={`Unmute now (${formatDuration(active.until - Date.now())} left)`}
                        action={() => unmute(channel.id)}
                    />
                    : <Menu.MenuItem id="xbt-mute-timer" label="Mute for a while">
                        {PRESETS.map(([label, ms]) => (
                            <Menu.MenuItem
                                key={label}
                                id={`xbt-mute-timer-${ms}`}
                                label={label}
                                action={() => muteFor(channel.guild_id!, channel.id, name, ms)}
                            />
                        ))}
                    </Menu.MenuItem>
            );
        }
    },

    async start() {
        await muted.load();

        for (const [channelId, entry] of muted.entries) {
            // A channel that has since been left or deleted would fail on unmute, and
            // there is nothing useful to do about it, so drop the record instead.
            if (!ChannelStore.getChannel(channelId)) {
                muted.delete(channelId);
                continue;
            }

            if (entry.until <= Date.now()) unmute(channelId);
            else schedule(entry);
        }
    },

    stop() {
        for (const cancel of timers.values()) cancel();
        timers.clear();
    }
});
