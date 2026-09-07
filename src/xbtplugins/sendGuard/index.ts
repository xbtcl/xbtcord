/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts, ChannelStore, GuildStore } from "@webpack/common";

/** Set while re-sending a confirmed message, so the hook does not catch its own resend. */
let bypass = false;

const settings = definePluginSettings({
    everyone: {
        type: OptionType.BOOLEAN,
        description: "Ask before sending at-everyone or at-here",
        default: true
    },
    massMentions: {
        type: OptionType.NUMBER,
        description: "Ask when a message mentions more than this many people. Zero turns it off",
        default: 5
    },
    inviteLinks: {
        type: OptionType.BOOLEAN,
        description: "Ask before posting a server invite",
        default: false
    },
    wrongChannel: {
        type: OptionType.STRING,
        description: "Ask before sending in any channel whose name contains one of these words, comma separated",
        default: "announcement, rules, general"
    }
});

const INVITE = /(discord\.gg|discord(?:app)?\.com\/invite)\/\w+/i;

function reasonsFor(channelId: string, content: string): string[] {
    const reasons: string[] = [];
    const channel = ChannelStore.getChannel(channelId);

    if (settings.store.everyone && /@(everyone|here)\b/.test(content)) {
        const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
        reasons.push(`It pings everyone${guild ? ` in ${guild.name}` : ""}.`);
    }

    const limit = settings.store.massMentions;
    if (limit > 0) {
        const mentions = (content.match(/<@!?\d+>/g) ?? []).length;
        if (mentions > limit) reasons.push(`It mentions ${mentions} people.`);
    }

    if (settings.store.inviteLinks && INVITE.test(content)) {
        reasons.push("It contains a server invite.");
    }

    const words = settings.store.wrongChannel.split(",").map(word => word.trim().toLowerCase()).filter(Boolean);
    const name = channel?.name?.toLowerCase() ?? "";
    if (name && words.some(word => name.includes(word))) {
        reasons.push(`You are in #${channel!.name}.`);
    }

    return reasons;
}

export default definePlugin({
    name: "SendGuard",
    description: "Asks first when a message would ping everyone, mention half the server, or land in the wrong channel",
    tags: ["Chat", "Utility", "Servers"],
    searchTerms: ["confirm", "everyone", "ping", "guard", "warn", "mistake", "safety"],
    authors: [Devs.Xbtcord],
    settings,

    /*
     * onBeforeMessageSend cannot cancel a send - the API has a TODO where that would go,
     * and nothing downstream reads a return value. So rather than pretend, this empties
     * the message and re-offers it: the send goes through as nothing, and the confirm
     * dialog puts the text back if you meant it.
     *
     * That is honest about what the hook can do, and it fails safe: the worst case is a
     * message you have to confirm, never one that goes out when you did not mean it to.
     */
    onBeforeMessageSend(channelId, message) {
        if (bypass || !message.content) return;

        const reasons = reasonsFor(channelId, message.content);
        if (!reasons.length) return;

        const { content } = message;
        message.content = "";

        Alerts.show({
            title: "Send that?",
            body: [...reasons, "", content.length > 300 ? `${content.slice(0, 300)}...` : content].join("\n"),
            confirmText: "Send it",
            cancelText: "Cancel",
            onConfirm: () => {
                // Re-sent through the real send path, so everything downstream - other
                // plugins included - sees an ordinary message. The flag stops this hook
                // catching its own resend and asking again forever.
                bypass = true;
                try {
                    sendMessage(channelId, { content });
                } finally {
                    bypass = false;
                }
            }
        });
    }
});
