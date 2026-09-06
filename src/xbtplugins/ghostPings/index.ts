/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildMemberStore, UserStore } from "@webpack/common";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

const logger = new Logger("GhostPings");

const settings = definePluginSettings({
    everyoneAndHere: {
        type: OptionType.BOOLEAN,
        description: "Also count @everyone and @here",
        default: false
    },
    roleMentions: {
        type: OptionType.BOOLEAN,
        description: "Also count mentions of a role you have",
        default: true
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore bots, which delete their own pings all the time",
        default: true
    },
    rememberMinutes: {
        type: OptionType.NUMBER,
        description: "How long a ping stays watched for. Deleting one after this is not reported",
        default: 60
    }
});

interface Pinged {
    id: string;
    channelId: string;
    author: string;
    authorId: string;
    content: string;
    at: number;
}

/**
 * Pings we have seen, kept ourselves.
 *
 * Reading the deleted message back out of Discord's own store is a race - by the time the
 * MESSAGE_DELETE listener runs, the store may already have dropped it, which is exactly the
 * case this plugin exists to catch. Keeping a small copy of only the messages that pinged
 * you sidesteps the ordering question entirely.
 */
const watched = new Map<string, Pinged>();

function prune() {
    const cutoff = Date.now() - Math.max(1, settings.store.rememberMinutes) * 60_000;
    for (const [id, entry] of watched) {
        if (entry.at < cutoff) watched.delete(id);
    }
}

function mentionsMe(message: any): boolean {
    const me = UserStore.getCurrentUser();
    if (!me || !message) return false;

    // Gateway payloads give mentions as user objects; some cached shapes give bare ids.
    if (message.mentions?.some?.((u: any) => (typeof u === "string" ? u : u?.id) === me.id)) return true;

    if (settings.store.everyoneAndHere && message.mention_everyone) return true;

    if (settings.store.roleMentions && message.mention_roles?.length) {
        const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
        if (guildId) {
            const myRoles = GuildMemberStore.getSelfMember(guildId)?.roles ?? [];
            if (message.mention_roles.some((r: string) => myRoles.includes(r))) return true;
        }
    }

    return false;
}

function report(entry: Pinged, what: "deleted" | "edited") {
    showNotification({
        title: `Ghost ping from ${entry.author}`,
        body: `They pinged you in ${describeChannel(entry.channelId)} and then ${what} it:\n${entry.content.slice(0, 200)}`,
        icon: UserStore.getUser(entry.authorId)?.getAvatarURL?.(undefined, 128),
        permanent: true,
        onClick: () => jumpToMessage(entry.channelId)
    });
}

export default definePlugin({
    name: "GhostPingDetector",
    description: "Tells you when someone pinged you and then deleted or edited the ping away",
    tags: ["Notifications", "Utility", "Chat"],
    searchTerms: ["ghost", "ping", "mention", "deleted", "edited"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic?: boolean; }) {
            try {
                if (optimistic || !message) return;

                const me = UserStore.getCurrentUser();
                if (!me || message.author?.id === me.id) return;
                if (settings.store.ignoreBots && message.author?.bot) return;
                if (!mentionsMe(message)) return;

                prune();
                watched.set(message.id, {
                    id: message.id,
                    channelId: message.channel_id,
                    author: message.author?.username ?? "Someone",
                    authorId: message.author?.id,
                    content: message.content ?? "",
                    at: Date.now()
                });
            } catch (err) {
                logger.error("Failed to record a mention", err);
            }
        },

        MESSAGE_DELETE({ id }: { id: string; }) {
            const entry = watched.get(id);
            if (!entry) return;
            watched.delete(id);
            report(entry, "deleted");
        },

        MESSAGE_UPDATE({ message }: { message: any; }) {
            try {
                const entry = message && watched.get(message.id);
                if (!entry) return;

                // An edit only counts if the ping is actually gone; people edit typos in
                // messages that still ping you all the time.
                if (message.content == null || mentionsMe({ ...message, channel_id: entry.channelId })) return;

                watched.delete(message.id);
                report(entry, "edited");
            } catch (err) {
                logger.error("Failed to check an edit", err);
            }
        }
    },

    stop() {
        watched.clear();
    }
});
