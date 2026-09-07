/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, openModal, RelationshipStore, SnowflakeUtils, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { jumpToMessage } from "@xbtplugins/_shared/util";

interface Flagged {
    userId: string;
    username: string;
    channelId: string;
    messageId: string;
    preview: string;
    reasons: string[];
    at: number;
}

const flagged = new PersistedRecord<Flagged>("Xbtcord_DmShield");

const settings = definePluginSettings({
    warnOnLinks: {
        type: OptionType.BOOLEAN,
        description: "Flag a first message from a stranger that contains a link",
        default: true
    },
    warnOnNewAccounts: {
        type: OptionType.NUMBER,
        description: "Flag accounts younger than this many days. Zero turns it off",
        default: 30
    },
    warnOnNoMutuals: {
        type: OptionType.BOOLEAN,
        description: "Flag someone you share no server with",
        default: true
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Raise a notification when something is flagged",
        default: true
    }
});

const SUSPICIOUS = /(free\s+nitro|steam\s*gift|claim\s+your|airdrop|@everyone|discord\.gift|nitro\s+giveaway)/i;
const LINK = /https?:\/\/\S+/i;

/*
 * This flags, it does not block or delete.
 *
 * A client mod guessing wrong about who is a scammer and silently hiding a real message
 * would be far worse than showing you a note. Everything here is a signal, not a verdict,
 * and the reasons are always spelled out so you can disagree with them.
 */
function assess(message: Message): string[] {
    const reasons: string[] = [];
    const authorId = message.author.id;

    if (settings.store.warnOnLinks && LINK.test(message.content ?? "")) {
        reasons.push("Opened with a link");
    }

    if (SUSPICIOUS.test(message.content ?? "")) {
        reasons.push("Uses wording common in scam DMs");
    }

    const days = settings.store.warnOnNewAccounts;
    if (days > 0) {
        const age = Date.now() - SnowflakeUtils.extractTimestamp(authorId);
        const inDays = Math.floor(age / 86_400_000);
        if (inDays < days) reasons.push(`Account is ${inDays} day${inDays === 1 ? "" : "s"} old`);
    }

    /*
     * Mutual servers are only fetched once you open somebody's profile, so asking for
     * them here would either be empty or would fire a request per incoming DM. Whether
     * the client has any relationship history at all is a cheaper stand-in, and it is
     * described as exactly that rather than as "no mutual servers".
     */
    if (settings.store.warnOnNoMutuals && !RelationshipStore.getSince(authorId)) {
        reasons.push("No relationship history with this account");
    }

    return reasons;
}

function ShieldModal(props: any) {
    flagged.use();

    const entries = flagged.entries.sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Flagged DMs" subtitle="Signals, not verdicts - decide for yourself" size="lg">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, item]) => (
                        <Row
                            key={id}
                            title={item.username}
                            preview={item.preview}
                            meta={`${item.reasons.join(" - ")} - ${ago(item.at)}`}
                            actions={[
                                { label: "Open", onClick: () => { jumpToMessage(item.channelId, item.messageId); props.onClose(); } },
                                { label: "Dismiss", danger: true, onClick: () => flagged.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing flagged.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => flagged.clear()}>Clear</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "DMShield",
    description: "Watches first messages from strangers and tells you why one looks like a scam, without hiding anything",
    tags: ["Privacy", "Notifications", "Friends"],
    searchTerms: ["dm", "scam", "spam", "shield", "stranger", "safety", "phishing"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (optimistic || !message?.id) return;

            const me = UserStore.getCurrentUser()?.id;
            const authorId = message.author?.id;
            if (!me || !authorId || authorId === me || message.author?.bot) return;

            // DMs only, and only from people you have not accepted as friends.
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel || channel.guild_id || channel.type !== 1) return;
            if (RelationshipStore.isFriend(authorId)) return;

            const reasons = assess(message);
            if (!reasons.length) return;

            flagged.set(makeId(), {
                userId: authorId,
                username: message.author.username,
                channelId: message.channel_id,
                messageId: message.id,
                preview: (message.content ?? "").slice(0, 200),
                reasons,
                at: Date.now()
            });

            if (settings.store.notify) {
                showNotification({
                    title: `A DM from ${message.author.username} looks off`,
                    body: reasons.join(". "),
                    onClick: () => jumpToMessage(message.channel_id, message.id)
                });
            }
        }
    },

    toolboxActions: {
        "Flagged DMs": () => openModal(props => <ShieldModal {...props} />)
    },

    start: () => flagged.load()
});
