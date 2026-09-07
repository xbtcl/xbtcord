/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { GuildMemberStore, GuildStore, openModal, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Mention {
    channelId: string;
    messageId: string;
    channelName: string;
    guildName?: string;
    author: string;
    content: string;
    kind: "direct" | "role" | "everyone" | "reply";
    at: number;
}

const mentions = new PersistedRecord<Mention>("Xbtcord_MentionsFeed");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many mentions to keep before the oldest fall off",
        default: 200
    },
    includeEveryone: {
        type: OptionType.BOOLEAN,
        description: "Also collect at-everyone and at-here",
        default: false
    },
    includeRoles: {
        type: OptionType.BOOLEAN,
        description: "Also collect mentions of roles you have",
        default: true
    }
});

/**
 * Discord has an Inbox, but it forgets a mention the moment you read the channel, and it
 * has never covered role pings properly. This keeps its own copy, so "what was I pinged
 * about yesterday" is answerable after you have already caught up.
 */
function classify(message: Message, myId: string): Mention["kind"] | null {
    if (message.mentions?.some((mention: any) => (typeof mention === "string" ? mention : mention?.id) === myId)) {
        return (message as any).referenced_message?.author?.id === myId ? "reply" : "direct";
    }

    if ((message as any).mention_everyone) return settings.store.includeEveryone ? "everyone" : null;

    if (settings.store.includeRoles) {
        const guildId = (message as any).guild_id;
        const roles: string[] = (message as any).mention_roles ?? [];

        if (guildId && roles.length) {
            const mine = GuildMemberStore.getSelfMember(guildId)?.roles ?? [];
            if (roles.some(role => mine.includes(role))) return "role";
        }
    }

    return null;
}

function prune() {
    const limit = Math.max(10, settings.store.keep);
    const entries = mentions.entries.sort((a, b) => b[1].at - a[1].at);
    for (const [id] of entries.slice(limit)) mentions.delete(id);
}

function FeedModal(props: any) {
    mentions.use();

    const entries = mentions.entries.sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Mentions" subtitle={`${entries.length} kept`} size="lg">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, mention]) => (
                        <Row
                            key={id}
                            title={
                                <>
                                    <span className="xbt-tag">{mention.kind}</span>{" "}
                                    {mention.author} in {mention.guildName ? `${mention.guildName} ` : ""}{mention.channelName}
                                </>
                            }
                            preview={mention.content || "(no text)"}
                            meta={ago(mention.at)}
                            actions={[
                                { label: "Jump", onClick: () => { jumpToMessage(mention.channelId, mention.messageId); props.onClose(); } },
                                { label: "Remove", danger: true, onClick: () => mentions.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing yet. Mentions land here as they arrive.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button variant="dangerPrimary" size="small" onClick={() => mentions.clear()}>Clear the feed</Button>
                </div>
            )}
        </XbtModal>
    );
}

const open = () => openModal(props => <FeedModal {...props} />);

export default definePlugin({
    name: "MentionsFeed",
    description: "Collects every ping you get into one list that does not empty itself when you read the channel",
    tags: ["Utility", "Notifications", "Organisation"],
    searchTerms: ["mentions", "pings", "inbox", "feed", "at", "everyone"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (optimistic || !message?.id) return;

            const me = UserStore.getCurrentUser()?.id;
            if (!me || message.author?.id === me) return;

            const kind = classify(message, me);
            if (!kind) return;

            const guildId = (message as any).guild_id;

            mentions.set(`${message.channel_id}-${message.id}`, {
                channelId: message.channel_id,
                messageId: message.id,
                channelName: describeChannel(message.channel_id),
                guildName: guildId ? GuildStore.getGuild(guildId)?.name : undefined,
                author: message.author?.username ?? "someone",
                content: (message.content ?? "").slice(0, 200),
                kind,
                at: Date.now()
            });

            prune();
        }
    },

    toolboxActions: {
        "Mentions": open
    },

    start: () => mentions.load()
});
