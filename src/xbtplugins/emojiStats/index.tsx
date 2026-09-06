/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Modal, openModal, Text, UserStore } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";

const logger = new Logger("EmojiStats");

interface Tally {
    /** `:name:` for custom emoji, the character itself for unicode. */
    label: string;
    /** Custom emoji id, so the real image can be shown. */
    emojiId?: string;
    animated?: boolean;
    sent: number;
    reacted: number;
}

const tallies = new PersistedRecord<Tally>("Xbtcord_EmojiStats");

const settings = definePluginSettings({
    countMessages: {
        type: OptionType.BOOLEAN,
        description: "Count emoji in messages you send",
        default: true
    },
    countReactions: {
        type: OptionType.BOOLEAN,
        description: "Count reactions you add",
        default: true
    }
});

const CUSTOM_EMOJI = /<(a)?:(\w+):(\d+)>/g;
// Extended_Pictographic is the closest single property to "an emoji", and it avoids
// dragging a several-hundred-KB emoji table into the bundle for a counter.
const UNICODE_EMOJI = /\p{Extended_Pictographic}/gu;

function bump(key: string, patch: Partial<Tally> & Pick<Tally, "label">, field: "sent" | "reacted") {
    const existing = tallies.get(key);
    tallies.set(key, {
        label: patch.label,
        emojiId: patch.emojiId ?? existing?.emojiId,
        animated: patch.animated ?? existing?.animated,
        sent: (existing?.sent ?? 0) + (field === "sent" ? 1 : 0),
        reacted: (existing?.reacted ?? 0) + (field === "reacted" ? 1 : 0)
    });
}

function countIn(content: string, field: "sent" | "reacted") {
    for (const [, animated, name, id] of content.matchAll(CUSTOM_EMOJI)) {
        bump(`custom:${id}`, { label: `:${name}:`, emojiId: id, animated: !!animated }, field);
    }

    // Strip the custom ones first, or their `:name:` text gets rescanned for pictographs.
    for (const [char] of content.replace(CUSTOM_EMOJI, "").matchAll(UNICODE_EMOJI)) {
        bump(`unicode:${char}`, { label: char }, field);
    }
}

function emojiUrl(tally: Tally) {
    return `https://cdn.discordapp.com/emojis/${tally.emojiId}.${tally.animated ? "gif" : "webp"}?size=32`;
}

function StatsList() {
    const all = tallies.use();
    const rows = Object.entries(all)
        .map(([key, tally]) => ({ key, ...tally, total: tally.sent + tally.reacted }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 100);

    if (!rows.length) {
        return <div className="xbt-empty">Nothing counted yet. Send some emoji and come back.</div>;
    }

    return (
        <div className="xbt-list">
            {rows.map((row, index) => (
                <div className="xbt-row" key={row.key}>
                    <Text variant="text-sm/semibold" style={{ width: 28, opacity: 0.6 }}>#{index + 1}</Text>
                    {row.emojiId
                        ? <img src={emojiUrl(row)} alt={row.label} width={24} height={24} />
                        : <span style={{ fontSize: 20 }}>{row.label}</span>}
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{row.label}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">
                            {row.sent} in messages &middot; {row.reacted} as reactions
                        </Text>
                    </div>
                    <Text variant="text-sm/semibold">{row.total}</Text>
                </div>
            ))}
        </div>
    );
}

function openStats() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Your emoji"
                subtitle="Counted on this machine, from the moment you turned this on"
                size="md"
                actions={[
                    { text: "Reset", variant: "secondary", onClick: () => tallies.clear() },
                    { text: "Close", variant: "primary", onClick: props.onClose }
                ]}
            >
                <StatsList />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "EmojiStats",
    description: "Counts which emoji you actually use, in messages and in reactions",
    tags: ["Emotes", "Reactions", "Fun"],
    searchTerms: ["emoji", "stats", "leaderboard", "usage", "favourite"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic?: boolean; }) {
            try {
                if (optimistic || !settings.store.countMessages || !message?.content) return;
                if (message.author?.id !== UserStore.getCurrentUser()?.id) return;
                countIn(message.content, "sent");
            } catch (err) {
                logger.error("Failed to count a message", err);
            }
        },

        MESSAGE_REACTION_ADD({ userId, emoji }: { userId: string; emoji: any; }) {
            try {
                if (!settings.store.countReactions) return;
                if (userId !== UserStore.getCurrentUser()?.id) return;
                if (!emoji) return;

                if (emoji.id) bump(`custom:${emoji.id}`, { label: `:${emoji.name}:`, emojiId: emoji.id, animated: emoji.animated }, "reacted");
                else if (emoji.name) bump(`unicode:${emoji.name}`, { label: emoji.name }, "reacted");
            } catch (err) {
                logger.error("Failed to count a reaction", err);
            }
        }
    },

    toolboxActions: {
        "Emoji stats": openStats
    },

    start: () => tallies.load()
});
