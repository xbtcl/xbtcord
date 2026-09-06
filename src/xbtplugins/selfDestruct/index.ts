/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { MessageActions, MessageStore, UserStore } from "@webpack/common";
import { formatDuration, parseDuration, setLongTimeout } from "@xbtplugins/_shared/util";

const logger = new Logger("SelfDestruct");

const settings = definePluginSettings({
    defaultDelay: {
        type: OptionType.STRING,
        description: "Delay used when you don't give one",
        default: "5m"
    },
    warnOnLongDelays: {
        type: OptionType.BOOLEAN,
        description: "Remind you that the deletion only happens while Discord is running",
        default: true
    }
});

const pending = new Set<() => void>();

/**
 * The id of the message we just sent.
 *
 * The send call resolves with the API response, which carries the id - but the exact shape
 * has changed before, so a miss falls back to finding our own newest message with the same
 * text. Deleting the wrong message would be much worse than not deleting at all, so the
 * fallback matches on author, channel and content together and gives up if unsure.
 */
async function resolveSentId(channelId: string, content: string, response: any): Promise<string | null> {
    const fromResponse = response?.body?.id ?? response?.id;
    if (typeof fromResponse === "string") return fromResponse;

    const me = UserStore.getCurrentUser();
    if (!me) return null;

    const messages: any[] = MessageStore.getMessages(channelId)?.toArray?.() ?? [];
    const match = messages
        .filter(m => m.author?.id === me.id && m.content === content)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    return match?.id ?? null;
}

export default definePlugin({
    name: "SelfDestruct",
    description: "Send a message that deletes itself after a set time",
    tags: ["Chat", "Privacy", "Commands"],
    searchTerms: ["selfdestruct", "ephemeral", "temporary", "auto delete", "disappearing"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],
    settings,

    commands: [
        {
            name: "selfdestruct",
            description: "Send a message that deletes itself later",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "message",
                    description: "What to send",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "after",
                    description: "How long it lives, e.g. 30s, 5m, 1h (a bare number means minutes)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            async execute(args, ctx) {
                const content = findOption(args, "message", "");
                const rawDelay = findOption(args, "after", "") || settings.store.defaultDelay;
                const delay = parseDuration(rawDelay);

                if (!content.trim()) {
                    sendBotMessage(ctx.channel.id, { content: "Nothing to send." });
                    return;
                }
                if (delay == null || delay <= 0) {
                    sendBotMessage(ctx.channel.id, { content: "I couldn't read that delay. Try `30s`, `5m` or `1h`." });
                    return;
                }

                try {
                    const response = await sendMessage(ctx.channel.id, { content });
                    const messageId = await resolveSentId(ctx.channel.id, content, response);

                    if (!messageId) {
                        sendBotMessage(ctx.channel.id, {
                            content: "Sent it, but I couldn't work out which message it became, so it will **not** delete itself. Delete it by hand."
                        });
                        return;
                    }

                    const cancel = setLongTimeout(() => {
                        pending.delete(cancel);
                        MessageActions.deleteMessage(ctx.channel.id, messageId);
                    }, delay);
                    pending.add(cancel);

                    if (settings.store.warnOnLongDelays && delay > 10 * 60_000) {
                        sendBotMessage(ctx.channel.id, {
                            content: `That deletes in ${formatDuration(delay)} - but only if Discord is still running then. Close it before that and the message stays up.`
                        });
                    }
                } catch (err) {
                    logger.error("Couldn't send", err);
                    sendBotMessage(ctx.channel.id, { content: "Couldn't send that." });
                }
            }
        }
    ],

    stop() {
        // Timers are dropped, not fired. Deleting a pile of messages because a plugin was
        // toggled off is not what anyone means by "stop".
        for (const cancel of pending) cancel();
        pending.clear();
    }
});
