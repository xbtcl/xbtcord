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
import { RelationshipStore, UserStore } from "@webpack/common";
import { describeChannel, jumpToMessage, setLongTimeout } from "@xbtplugins/_shared/util";

const logger = new Logger("PingReminder");

const settings = definePluginSettings({
    minutes: {
        type: OptionType.SLIDER,
        description: "How long to wait before reminding you about an unanswered ping",
        markers: [5, 10, 15, 30, 60, 120],
        default: 15,
        stickToMarkers: false
    },
    onlyFriends: {
        type: OptionType.BOOLEAN,
        description: "Only for pings from friends",
        default: false
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore bots",
        default: true
    }
});

interface Pending {
    cancel: () => void;
    author: string;
    messageId: string;
}

/** One outstanding reminder per channel - a second ping there just resets the clock. */
const pending = new Map<string, Pending>();

function clear(channelId: string) {
    pending.get(channelId)?.cancel();
    pending.delete(channelId);
}

export default definePlugin({
    name: "PingReminder",
    description: "Nudges you about a ping you never answered",
    tags: ["Notifications", "Utility"],
    searchTerms: ["ping", "mention", "reminder", "reply", "unanswered", "forgot"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic?: boolean; }) {
            try {
                if (!message) return;

                const me = UserStore.getCurrentUser();
                if (!me) return;

                // Anything you send in a channel counts as having dealt with it, which is
                // both cheaper and more accurate than trying to detect a direct reply.
                if (message.author?.id === me.id) {
                    clear(message.channel_id);
                    return;
                }

                if (optimistic) return;
                if (settings.store.ignoreBots && message.author?.bot) return;
                if (!message.mentions?.some?.((u: any) => (typeof u === "string" ? u : u?.id) === me.id)) return;
                if (settings.store.onlyFriends && !RelationshipStore.isFriend(message.author?.id)) return;

                clear(message.channel_id);

                const author = message.author?.username ?? "Someone";
                const messageId = message.id;
                const channelId = message.channel_id;
                const delay = Math.max(1, settings.store.minutes) * 60_000;

                const cancel = setLongTimeout(() => {
                    pending.delete(channelId);
                    showNotification({
                        title: "You never replied",
                        body: `${author} pinged you in ${describeChannel(channelId)} and you haven't said anything since.`,
                        onClick: () => jumpToMessage(channelId, messageId)
                    });
                }, delay);

                pending.set(channelId, { cancel, author, messageId });
            } catch (err) {
                logger.error("Failed to handle a message", err);
            }
        }
    },

    stop() {
        for (const entry of pending.values()) entry.cancel();
        pending.clear();
    }
});
