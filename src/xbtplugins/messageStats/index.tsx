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
import { GuildStore, openModal, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel } from "@xbtplugins/_shared/util";

interface Bucket {
    messages: number;
    words: number;
    characters: number;
    attachments: number;
    /** yyyy-mm-dd, so a day can be counted without storing every timestamp. */
    days: Record<string, number>;
    label: string;
}

const stats = new PersistedRecord<Bucket>("Xbtcord_MessageStats");

const settings = definePluginSettings({
    trackPerChannel: {
        type: OptionType.BOOLEAN,
        description: "Break the numbers down per channel as well as overall",
        default: true
    }
});

const TOTAL = "__total__";

function today() {
    return new Date().toISOString().slice(0, 10);
}

/*
 * Only your own messages, and only counts - no content is stored anywhere. Discord will
 * not tell anyone how much they have typed, and nothing here needs the text itself to
 * answer that, so it does not keep any.
 */
function bump(key: string, label: string, message: Message) {
    const existing = stats.get(key) ?? { messages: 0, words: 0, characters: 0, attachments: 0, days: {}, label };
    const day = today();

    stats.set(key, {
        label,
        messages: existing.messages + 1,
        words: existing.words + (message.content?.trim() ? message.content.trim().split(/\s+/).length : 0),
        characters: existing.characters + (message.content?.length ?? 0),
        attachments: existing.attachments + (message.attachments?.length ?? 0),
        days: { ...existing.days, [day]: (existing.days[day] ?? 0) + 1 }
    });
}

function activeDays(bucket: Bucket) {
    return Object.keys(bucket.days).length;
}

function StatsModal(props: any) {
    stats.use();

    const total = stats.get(TOTAL);
    const channels = stats.entries
        .filter(([key]) => key !== TOTAL)
        .sort((a, b) => b[1].messages - a[1].messages)
        .slice(0, 25);

    return (
        <XbtModal props={props} title="Your message stats" subtitle="Counted on this machine, from the day you turned it on" size="lg">
            {total
                ? (
                    <>
                        <div className="xbt-list">
                            <Row
                                title={`${total.messages.toLocaleString()} messages`}
                                meta={`${total.words.toLocaleString()} words, ${total.characters.toLocaleString()} characters, ${total.attachments.toLocaleString()} attachments`}
                                preview={`Across ${activeDays(total)} day(s) - about ${Math.round(total.messages / Math.max(1, activeDays(total)))} a day`}
                            />
                        </div>

                        {!!channels.length && (
                            <>
                                <div className="xbt-row-meta" style={{ margin: "12px 0 6px" }}>Busiest channels</div>
                                <div className="xbt-list">
                                    {channels.map(([key, bucket]) => (
                                        <Row
                                            key={key}
                                            title={bucket.label}
                                            meta={`${bucket.messages.toLocaleString()} messages, ${bucket.words.toLocaleString()} words`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        <div style={{ marginTop: 12 }}>
                            <Button size="small" variant="dangerPrimary" onClick={() => stats.clear()}>
                                Reset everything
                            </Button>
                        </div>
                    </>
                )
                : <Empty>Nothing counted yet. Send something.</Empty>
            }
        </XbtModal>
    );
}

export default definePlugin({
    name: "MessageStats",
    description: "Counts how much you actually type - messages, words and busiest channels - without keeping any of the text",
    tags: ["Utility", "Organisation"],
    searchTerms: ["stats", "statistics", "count", "messages", "words", "wrapped"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (optimistic || !message?.id) return;

            const me = UserStore.getCurrentUser()?.id;
            if (!me || message.author?.id !== me) return;

            bump(TOTAL, "Everything", message);

            if (settings.store.trackPerChannel) {
                const guildId = (message as any).guild_id;
                const guild = guildId ? GuildStore.getGuild(guildId)?.name : undefined;
                bump(message.channel_id, `${guild ? `${guild} ` : ""}${describeChannel(message.channel_id)}`, message);
            }
        }
    },

    toolboxActions: {
        "Message stats": () => openModal(props => <StatsModal {...props} />)
    },

    start: () => stats.load()
});
