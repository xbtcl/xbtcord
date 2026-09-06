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
import { ChannelStore, RelationshipStore, SelectedChannelStore, UserStore } from "@webpack/common";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

const logger = new Logger("KeywordAlerts");

const settings = definePluginSettings({
    keywords: {
        type: OptionType.STRING,
        description: "Words to watch for, comma separated",
        default: ""
    },
    useRegex: {
        type: OptionType.BOOLEAN,
        description: "Treat each entry as a regular expression instead of plain text",
        default: false
    },
    wholeWordOnly: {
        type: OptionType.BOOLEAN,
        description: "Only match whole words, so 'cat' does not match 'catalogue' (plain text mode only)",
        default: true
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore messages from bots",
        default: true
    },
    ignoreBlocked: {
        type: OptionType.BOOLEAN,
        description: "Ignore messages from people you have blocked",
        default: true
    },
    ignoreCurrentChannel: {
        type: OptionType.BOOLEAN,
        description: "Don't alert for the channel you are already looking at",
        default: true
    },
    guildAllowlist: {
        type: OptionType.STRING,
        description: "Only watch these server IDs, comma separated (empty means everywhere)",
        default: ""
    },
    guildBlocklist: {
        type: OptionType.STRING,
        description: "Never watch these server IDs, comma separated",
        default: ""
    }
});

/**
 * Compiled once per settings change rather than per message.
 *
 * A bad regex from the settings box must not take the whole listener down with it, so each
 * pattern is compiled in isolation and a broken one is dropped with a log line.
 */
let compiled: RegExp[] = [];
let compiledFrom = "";

function patterns(): RegExp[] {
    const { keywords, useRegex, wholeWordOnly } = settings.store;
    const signature = `${keywords}|${useRegex}|${wholeWordOnly}`;
    if (signature === compiledFrom) return compiled;

    compiledFrom = signature;
    compiled = keywords
        .split(",")
        .map(k => k.trim())
        .filter(Boolean)
        .flatMap(keyword => {
            try {
                if (useRegex) return [new RegExp(keyword, "i")];
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return [new RegExp(wholeWordOnly ? `\\b${escaped}\\b` : escaped, "i")];
            } catch (err) {
                logger.warn(`Ignoring "${keyword}" - it isn't a valid pattern`, err);
                return [];
            }
        });

    return compiled;
}

function idList(raw: string) {
    return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function shouldWatch(guildId?: string) {
    const allow = idList(settings.store.guildAllowlist);
    const block = idList(settings.store.guildBlocklist);

    if (guildId && block.includes(guildId)) return false;
    if (allow.length) return !!guildId && allow.includes(guildId);
    return true;
}

export default definePlugin({
    name: "KeywordAlerts",
    description: "Get a notification whenever a word you care about is said anywhere you can read",
    tags: ["Notifications", "Utility"],
    searchTerms: ["keyword", "highlight", "watch", "alert", "notify", "ping"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic?: boolean; }) {
            try {
                if (optimistic || !message?.content) return;

                const me = UserStore.getCurrentUser();
                if (!me || message.author?.id === me.id) return;
                if (settings.store.ignoreBots && message.author?.bot) return;
                if (settings.store.ignoreBlocked && RelationshipStore.isBlocked(message.author?.id)) return;

                const channel = ChannelStore.getChannel(message.channel_id);
                if (!shouldWatch(channel?.guild_id)) return;

                if (settings.store.ignoreCurrentChannel && SelectedChannelStore.getChannelId() === message.channel_id) return;

                // Discord already notifies for a real mention; a second popup for the same
                // message is noise, not a feature.
                if (message.mentions?.some((u: any) => u.id === me.id)) return;

                const hit = patterns().find(re => re.test(message.content));
                if (!hit) return;

                showNotification({
                    title: `${message.author?.username ?? "Someone"} in ${describeChannel(message.channel_id)}`,
                    body: message.content.slice(0, 200),
                    icon: UserStore.getUser(message.author?.id)?.getAvatarURL?.(undefined, 128),
                    onClick: () => jumpToMessage(message.channel_id, message.id)
                });
            } catch (err) {
                logger.error("Failed to check a message", err);
            }
        }
    }
});
