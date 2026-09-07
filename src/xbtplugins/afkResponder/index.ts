/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, RelationshipStore, showToast, Toasts, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

const logger = new Logger("AfkResponder");

const settings = definePluginSettings({
    message: {
        type: OptionType.STRING,
        description: "What to reply with",
        default: "I am away from my computer right now - I will get back to you."
    },
    afterMinutes: {
        type: OptionType.NUMBER,
        description: "Go away automatically after this many minutes without touching Discord. Zero means manual only",
        default: 0
    },
    friendsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only reply to friends",
        default: true
    },
    oncePerPerson: {
        type: OptionType.BOOLEAN,
        description: "Reply once per person per away session, rather than to every message",
        default: true
    }
});

let away = false;
let lastActivity = Date.now();
let idleTimer: ReturnType<typeof setInterval> | undefined;
const replied = new Set<string>();

export function setAway(value: boolean) {
    if (away === value) return;

    away = value;
    replied.clear();

    showToast(away ? "Away - DMs will get your auto reply" : "Back - auto reply off", Toasts.Type.MESSAGE);
}

export function isAway() {
    return away;
}

function noteActivity() {
    lastActivity = Date.now();

    // Typing counts as being back. Coming back and being auto-replied to on your behalf
    // for the next hour would be worse than not having the feature at all.
    if (away && settings.store.afterMinutes > 0) setAway(false);
}

function checkIdle() {
    const minutes = settings.store.afterMinutes;
    if (!minutes || away) return;

    if (Date.now() - lastActivity > minutes * 60_000) setAway(true);
}

export default definePlugin({
    name: "AfkResponder",
    description: "Answers DMs with a note that you are away, once per person, until you touch Discord again",
    tags: ["Utility", "Chat", "Friends"],
    searchTerms: ["afk", "away", "auto reply", "autoresponder", "dnd", "busy"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (!away || optimistic || !message?.id) return;

            const me = UserStore.getCurrentUser()?.id;
            if (!me || message.author?.id === me || message.author?.bot) return;

            /*
             * DMs only, on purpose. An auto reply in a busy server would be spam, would
             * annoy everyone in it, and is the kind of thing that gets accounts actioned.
             * A direct message is the only place a reply of this sort is welcome.
             */
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel || channel.guild_id) return;

            const authorId = message.author.id;
            if (settings.store.friendsOnly && !RelationshipStore.isFriend(authorId)) return;
            if (settings.store.oncePerPerson && replied.has(authorId)) return;

            replied.add(authorId);

            try {
                sendMessage(message.channel_id, { content: settings.store.message });
            } catch (err) {
                logger.error("Could not send the away reply", err);
            }
        }
    },

    toolboxActions: {
        "Toggle away": () => setAway(!away)
    },

    start() {
        lastActivity = Date.now();
        window.addEventListener("keydown", noteActivity, true);
        window.addEventListener("mousedown", noteActivity, true);
        idleTimer = setInterval(checkIdle, 30_000);
    },

    stop() {
        window.removeEventListener("keydown", noteActivity, true);
        window.removeEventListener("mousedown", noteActivity, true);
        clearInterval(idleTimer);
        away = false;
        replied.clear();
    }
});
