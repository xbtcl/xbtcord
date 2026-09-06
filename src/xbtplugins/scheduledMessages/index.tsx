/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { makeId } from "@xbtplugins/_shared/store";
import { describeChannel, formatDuration, jumpToMessage, parseDuration, setLongTimeout } from "@xbtplugins/_shared/util";

import { openScheduledModal, scheduled, ScheduledMessage } from "./scheduled";

const settings = definePluginSettings({
    lateGraceMinutes: {
        type: OptionType.NUMBER,
        description: "If Discord was closed when a message came due, still send it if it is less than this many minutes late (0 never sends late)",
        default: 5
    }
});

const timers = new Map<string, () => void>();

function deliver(item: ScheduledMessage) {
    timers.delete(item.id);
    scheduled.delete(item.id);

    try {
        sendMessage(item.channelId, { content: item.content });
    } catch (err) {
        showNotification({
            title: "Scheduled message failed",
            body: `Couldn't send to ${item.channelName}. The text is in this notification so you don't lose it:\n${item.content}`,
            permanent: true,
            onClick: () => jumpToMessage(item.channelId)
        });
    }
}

function schedule(item: ScheduledMessage) {
    timers.get(item.id)?.();
    timers.set(item.id, setLongTimeout(() => deliver(item), item.sendAt - Date.now()));
}

export function cancelScheduled(id: string) {
    timers.get(id)?.();
    timers.delete(id);
    scheduled.delete(id);
}

export function sendNow(id: string) {
    const item = scheduled.get(id);
    if (!item) return;
    timers.get(id)?.();
    deliver(item);
}

export default definePlugin({
    name: "ScheduledMessages",
    description: "Write a message now and have it sent later with /schedule",
    tags: ["Chat", "Utility", "Commands"],
    searchTerms: ["schedule", "later", "delay", "timer", "queue"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],
    settings,

    commands: [
        {
            name: "schedule",
            description: "Send a message in this channel later",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "in",
                    description: "How long to wait, e.g. 10m, 2h30m, 1d (a bare number means minutes)",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "message",
                    description: "What to send",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const delay = parseDuration(findOption(args, "in", ""));
                const content = findOption(args, "message", "");

                if (delay == null || delay <= 0) {
                    sendBotMessage(ctx.channel.id, { content: "I couldn't read that delay. Try `10m`, `2h30m` or `1d`." });
                    return;
                }
                if (!content.trim()) {
                    sendBotMessage(ctx.channel.id, { content: "Nothing to send." });
                    return;
                }

                const item: ScheduledMessage = {
                    id: makeId(),
                    channelId: ctx.channel.id,
                    channelName: describeChannel(ctx.channel.id),
                    content,
                    createdAt: Date.now(),
                    sendAt: Date.now() + delay
                };

                scheduled.set(item.id, item);
                schedule(item);

                sendBotMessage(ctx.channel.id, {
                    content: `Queued for ${new Date(item.sendAt).toLocaleString()} (in ${formatDuration(delay)}).\nDiscord has to be open then - see the Xbtcord toolbox to cancel it.`
                });
            }
        },
        {
            name: "scheduled",
            description: "Show everything you have queued to send later",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute() {
                openScheduledModal();
            }
        }
    ],

    toolboxActions: {
        "Scheduled messages": openScheduledModal
    },

    async start() {
        await scheduled.load();

        const grace = Math.max(0, settings.store.lateGraceMinutes) * 60_000;

        for (const [, item] of scheduled.entries) {
            const lateBy = Date.now() - item.sendAt;

            if (lateBy <= 0) {
                schedule(item);
                continue;
            }

            // Sending a message hours after it was meant to go out is worse than not
            // sending it - the reply lands with no context and looks unhinged. Past the
            // grace window it is kept and surfaced instead, so nothing is lost silently.
            if (lateBy <= grace) {
                deliver(item);
            } else {
                showNotification({
                    title: "A scheduled message was missed",
                    body: `Discord was closed when this was due for ${item.channelName}:\n${item.content}`,
                    permanent: true,
                    onClick: openScheduledModal
                });
            }
        }
    },

    stop() {
        for (const cancel of timers.values()) cancel();
        timers.clear();
    }
});
