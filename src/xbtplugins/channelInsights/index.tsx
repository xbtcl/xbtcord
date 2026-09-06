/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ApplicationCommandInputType } from "@api/Commands";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import { MessageStore, Modal, openModal, Text, useMemo, useState } from "@webpack/common";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Row {
    author: string;
    messages: number;
    characters: number;
    attachments: number;
    lastAt: number;
}

/**
 * Everything here is computed from the messages the client already has in memory.
 *
 * No requests are made: this is a read of MessageStore, so it is instant and it can only
 * ever describe the part of the channel you have actually scrolled through. The count of
 * loaded messages is shown alongside the results so the numbers are never mistaken for
 * the channel's whole history.
 */
function collect(channelId: string) {
    const messages: any[] = MessageStore.getMessages(channelId)?.toArray?.() ?? [];
    const byAuthor = new Map<string, Row>();

    let attachments = 0;
    let links = 0;

    for (const message of messages) {
        const name = message.author?.username ?? "Unknown";
        const row = byAuthor.get(name) ?? { author: name, messages: 0, characters: 0, attachments: 0, lastAt: 0 };

        row.messages++;
        row.characters += message.content?.length ?? 0;
        row.attachments += message.attachments?.length ?? 0;
        row.lastAt = Math.max(row.lastAt, new Date(message.timestamp).getTime());

        byAuthor.set(name, row);

        attachments += message.attachments?.length ?? 0;
        if (/https?:\/\//.test(message.content ?? "")) links++;
    }

    return {
        loaded: messages.length,
        attachments,
        links,
        rows: [...byAuthor.values()].sort((a, b) => b.messages - a.messages)
    };
}

function Insights({ channelId, close }: { channelId: string; close(): void; }) {
    const data = useMemo(() => collect(channelId), [channelId]);
    const [showAll, setShowAll] = useState(false);

    if (!data.loaded) {
        return <div className="xbt-empty">Nothing loaded in this channel yet. Scroll up a little first.</div>;
    }

    const rows = showAll ? data.rows : data.rows.slice(0, 15);

    return (
        <>
            <div className="xbt-form">
                <Text variant="text-sm/normal" className="xbt-row-meta">
                    {data.loaded} messages loaded · {data.attachments} attachments · {data.links} with links
                </Text>
            </div>

            <div className="xbt-list">
                {rows.map((row, index) => (
                    <div className="xbt-row" key={row.author}>
                        <Text variant="text-sm/semibold" style={{ width: 28, opacity: 0.6 }}>#{index + 1}</Text>
                        <div className="xbt-row-body">
                            <Text variant="text-sm/semibold">{row.author}</Text>
                            <Text variant="text-xs/normal" className="xbt-row-meta">
                                {row.characters.toLocaleString()} characters
                                {row.attachments > 0 && ` · ${row.attachments} attachments`}
                                {" · "}last {new Date(row.lastAt).toLocaleString()}
                            </Text>
                        </div>
                        <Text variant="text-sm/semibold">{row.messages}</Text>
                    </div>
                ))}
            </div>

            {!showAll && data.rows.length > rows.length && (
                <Button size="small" variant="secondary" onClick={() => setShowAll(true)}>
                    Show the other {data.rows.length - rows.length}
                </Button>
            )}
        </>
    );
}

function open() {
    const channel = getCurrentChannel();
    if (!channel) return;

    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title={`Who talks in ${describeChannel(channel.id)}`}
                subtitle="From the messages already loaded, not the whole channel"
                size="md"
                actions={[
                    {
                        text: "Go to channel",
                        variant: "secondary",
                        onClick: () => { jumpToMessage(channel.id); props.onClose(); }
                    },
                    { text: "Close", variant: "primary", onClick: props.onClose }
                ]}
            >
                <Insights channelId={channel.id} close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "ChannelInsights",
    description: "Who talks most in this channel, counted from what you have loaded",
    tags: ["Utility", "Chat"],
    searchTerms: ["stats", "insights", "who", "leaderboard", "activity", "count"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "insights",
            description: "Who talks most in this channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: () => void open()
        }
    ],

    toolboxActions: {
        "Channel insights": open
    }
});
