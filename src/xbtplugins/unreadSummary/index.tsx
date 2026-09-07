/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { GuildChannelStore, GuildStore, openModal, ReadStateStore, useState } from "@webpack/common";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { jumpToMessage } from "@xbtplugins/_shared/util";

const settings = definePluginSettings({
    mentionsFirst: {
        type: OptionType.BOOLEAN,
        description: "Put channels that mention you at the top",
        default: true
    },
    hideNoMentions: {
        type: OptionType.BOOLEAN,
        description: "Only list channels that actually mention you",
        default: false
    }
});

interface Line {
    channelId: string;
    name: string;
    guild: string;
    mentions: number;
}

/*
 * The sidebar tells you that something is unread; it does not tell you how much, or where
 * the mentions are, without opening every server folder. ReadStateStore already knows
 * both, so this is a read of state the client is keeping anyway.
 */
function collect(): Line[] {
    const lines: Line[] = [];

    for (const guild of Object.values(GuildStore.getGuilds() ?? {}) as any[]) {
        // SELECTABLE is everything you can actually click into: text channels, threads
        // and announcements, already filtered by what you have permission to read. It
        // deliberately excludes categories, which would double count their children.
        const selectable = (GuildChannelStore.getChannels(guild.id)?.SELECTABLE ?? []) as any[];

        for (const entry of selectable) {
            const channel = entry.channel ?? entry;
            if (!channel?.id || !ReadStateStore.hasUnread(channel.id)) continue;

            lines.push({
                channelId: channel.id,
                name: `#${channel.name}`,
                guild: guild.name,
                mentions: ReadStateStore.getMentionCount(channel.id) ?? 0
            });
        }
    }

    return lines;
}

function SummaryModal(props: any) {
    const [lines] = useState(collect);

    const filtered = lines
        .filter(line => !settings.store.hideNoMentions || line.mentions > 0)
        .sort((a, b) => (settings.store.mentionsFirst ? b.mentions - a.mentions : 0)
            || a.guild.localeCompare(b.guild)
            || a.name.localeCompare(b.name));

    const totalMentions = lines.reduce((sum, line) => sum + line.mentions, 0);

    return (
        <XbtModal
            props={props}
            title="What you have missed"
            subtitle={`${filtered.length} unread channel(s), ${totalMentions} mention(s)`}
            size="lg"
        >
            <div className="xbt-list">
                {filtered.length
                    ? filtered.map(line => (
                        <Row
                            key={line.channelId}
                            title={line.name}
                            meta={line.guild}
                            preview={line.mentions ? `${line.mentions} mention${line.mentions === 1 ? "" : "s"}` : undefined}
                            actions={[{ label: "Open", onClick: () => { jumpToMessage(line.channelId); props.onClose(); } }]}
                        />
                    ))
                    : <Empty>Nothing unread. Enjoy it.</Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "UnreadSummary",
    description: "One list of every unread channel and where your mentions are, instead of hunting through the sidebar",
    tags: ["Utility", "Organisation", "Servers"],
    searchTerms: ["unread", "summary", "catch up", "mentions", "inbox", "missed"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "What have I missed": () => openModal(props => <SummaryModal {...props} />)
    }
});
