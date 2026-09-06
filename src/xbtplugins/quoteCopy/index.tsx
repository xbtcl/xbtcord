/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { CopyIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

const settings = definePluginSettings({
    includeAuthor: {
        type: OptionType.BOOLEAN,
        description: "Credit the person who said it",
        default: true
    },
    includeTimestamp: {
        type: OptionType.BOOLEAN,
        description: "Include when they said it",
        default: false
    },
    includeLink: {
        type: OptionType.BOOLEAN,
        description: "Include a jump link to the original",
        default: false
    }
});

function quote(message: Message): string {
    // Every line needs the marker, or Discord's blockquote stops at the first newline.
    const body = (message.content || "(no text)")
        .split("\n")
        .map(line => `> ${line}`)
        .join("\n");

    if (!settings.store.includeAuthor && !settings.store.includeTimestamp && !settings.store.includeLink) {
        return body;
    }

    const bits: string[] = [];
    if (settings.store.includeAuthor) bits.push(`— ${message.author.username}`);
    if (settings.store.includeTimestamp) bits.push(new Date(message.timestamp as any).toLocaleString());

    if (settings.store.includeLink) {
        const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id ?? "@me";
        bits.push(`<https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}>`);
    }

    return `${body}\n${bits.join(" · ")}`;
}

export default definePlugin({
    name: "QuoteCopy",
    description: "Copies a message as a proper markdown blockquote, ready to paste",
    tags: ["Chat", "Utility"],
    searchTerms: ["quote", "copy", "blockquote", "cite", "reply"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            if (!message) return;

            children.push(
                <Menu.MenuItem id="xbt-quote" label="Quote" icon={CopyIcon}>
                    <Menu.MenuItem
                        id="xbt-quote-copy"
                        label="Copy as quote"
                        action={() => copyWithToast(quote(message), "Copied as a quote")}
                    />
                    <Menu.MenuItem
                        id="xbt-quote-insert"
                        label="Insert into the chat box"
                        action={() => insertTextIntoChatInputBox(`${quote(message)}\n`)}
                    />
                </Menu.MenuItem>
            );
        }
    }
});
