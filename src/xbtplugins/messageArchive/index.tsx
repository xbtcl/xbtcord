/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { LogIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { Menu, MessageStore, showToast, Toasts } from "@webpack/common";
import { describeChannel } from "@xbtplugins/_shared/util";

const logger = new Logger("MessageArchive");

type Format = "txt" | "md" | "json";

function loaded(channelId: string): any[] {
    return (MessageStore.getMessages(channelId)?.toArray?.() ?? [])
        .slice()
        .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function render(messages: any[], format: Format, channelName: string): string {
    if (format === "json") {
        return JSON.stringify(messages.map(m => ({
            id: m.id,
            author: m.author?.username,
            authorId: m.author?.id,
            timestamp: m.timestamp,
            content: m.content,
            attachments: (m.attachments ?? []).map((a: any) => a.url),
            editedTimestamp: m.editedTimestamp ?? null
        })), null, 2);
    }

    const lines: string[] = [
        format === "md" ? `# ${channelName}` : channelName,
        `Exported ${new Date().toLocaleString()} — ${messages.length} messages`,
        ""
    ];

    for (const message of messages) {
        const when = new Date(message.timestamp).toLocaleString();
        const who = message.author?.username ?? "Unknown";

        lines.push(format === "md" ? `**${who}** *(${when})*` : `[${when}] ${who}`);
        if (message.content) lines.push(message.content);

        for (const attachment of message.attachments ?? []) {
            lines.push(format === "md" ? `- ${attachment.url}` : `  ${attachment.url}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Saves through a blob URL and a synthetic click.
 *
 * The desktop client is still a Chromium page, so an <a download> works exactly as it does
 * on the web; there is no need for anything in the main process.
 */
function save(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function archive(channelId: string, format: Format) {
    try {
        const messages = loaded(channelId);
        if (!messages.length) {
            showToast("Nothing loaded in this channel to export", Toasts.Type.FAILURE);
            return;
        }

        const name = describeChannel(channelId).replace(/[<>:"/\\|?*#]/g, "_");
        save(render(messages, format, describeChannel(channelId)), `${name}.${format}`);
        showToast(`Exported ${messages.length} messages`, Toasts.Type.SUCCESS);
    } catch (err) {
        logger.error("Export failed", err);
        showToast("Couldn't export this channel", Toasts.Type.FAILURE);
    }
}

export default definePlugin({
    name: "MessageArchive",
    description: "Saves the messages loaded in a channel to a text, markdown or JSON file",
    tags: ["Utility", "Chat"],
    searchTerms: ["archive", "export", "save", "backup", "log", "download", "txt", "json"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "archive",
            description: "Save this channel's loaded messages to a file",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "format",
                    description: "txt, md or json (defaults to txt)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args, ctx) {
                const raw = findOption(args, "format", "txt").toLowerCase();
                if (!["txt", "md", "json"].includes(raw)) {
                    sendBotMessage(ctx.channel.id, { content: "Format has to be `txt`, `md` or `json`." });
                    return;
                }
                archive(ctx.channel.id, raw as Format);
            }
        }
    ],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: any; }) => {
            if (!channel?.id) return;
            children.push(
                <Menu.MenuItem id="xbt-archive" label="Export messages" icon={LogIcon}>
                    <Menu.MenuItem id="xbt-archive-txt" label="Plain text" action={() => archive(channel.id, "txt")} />
                    <Menu.MenuItem id="xbt-archive-md" label="Markdown" action={() => archive(channel.id, "md")} />
                    <Menu.MenuItem id="xbt-archive-json" label="JSON" action={() => archive(channel.id, "json")} />
                </Menu.MenuItem>
            );
        }
    },

    toolboxActions: {
        "Export this channel": () => {
            const channel = getCurrentChannel();
            if (channel) archive(channel.id, "txt");
        }
    }
});
