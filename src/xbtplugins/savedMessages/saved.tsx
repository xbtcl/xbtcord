/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { copyWithToast } from "@utils/discord";
import { ChannelStore, Modal, openModal, Text, TextInput, useMemo, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

export interface SavedMessage {
    id: string;
    channelId: string;
    guildId?: string;
    messageId: string;
    channelName: string;
    author: string;
    content: string;
    attachments: string[];
    collection: string;
    savedAt: number;
}

export const saved = new PersistedRecord<SavedMessage>("Xbtcord_SavedMessages");

/** One message can only be saved once, so its own id is the key. */
export function keyFor(message: Message) {
    return `${message.channel_id}:${message.id}`;
}

export function isSaved(message: Message) {
    return saved.has(keyFor(message));
}

export function save(message: Message, collection = "Saved") {
    const channel = ChannelStore.getChannel(message.channel_id);

    saved.set(keyFor(message), {
        id: keyFor(message),
        channelId: message.channel_id,
        guildId: channel?.guild_id,
        messageId: message.id,
        channelName: describeChannel(message.channel_id),
        author: message.author.username,
        content: message.content,
        attachments: (message.attachments ?? []).map(a => a.url).slice(0, 4),
        collection,
        savedAt: Date.now()
    });
}

export function unsave(message: Message) {
    saved.delete(keyFor(message));
}

export function collections(): string[] {
    const names = new Set(Object.values(saved.all).map(m => m.collection));
    names.add("Saved");
    return [...names].sort();
}

function SavedList({ close }: { close(): void; }) {
    const all = saved.use();
    const [query, setQuery] = useState("");
    const [collection, setCollection] = useState<string | null>(null);

    const items = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return Object.values(all)
            .filter(m => collection == null || m.collection === collection)
            .filter(m => !needle ||
                m.content.toLowerCase().includes(needle) ||
                m.author.toLowerCase().includes(needle) ||
                m.channelName.toLowerCase().includes(needle))
            .sort((a, b) => b.savedAt - a.savedAt);
    }, [all, query, collection]);

    const names = useMemo(() => [...new Set(Object.values(all).map(m => m.collection))].sort(), [all]);

    return (
        <>
            <div className="xbt-form">
                <TextInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search saved messages"
                    fullWidth
                    clearable
                />
                {names.length > 1 && (
                    <div className="xbt-form-row">
                        <Button
                            size="small"
                            variant={collection == null ? "primary" : "secondary"}
                            onClick={() => setCollection(null)}
                        >
                            All
                        </Button>
                        {names.map(name => (
                            <Button
                                key={name}
                                size="small"
                                variant={collection === name ? "primary" : "secondary"}
                                onClick={() => setCollection(name)}
                            >
                                {name}
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {!items.length
                ? <div className="xbt-empty">Nothing saved yet. Hit the bookmark on any message.</div>
                : (
                    <div className="xbt-list">
                        {items.map(item => (
                            <div className="xbt-row" key={item.id}>
                                <div className="xbt-row-body">
                                    <Text variant="text-sm/semibold">
                                        {item.author} in {item.channelName} <span className="xbt-tag">{item.collection}</span>
                                    </Text>
                                    <Text variant="text-sm/normal" className="xbt-row-preview">
                                        {item.content || `${item.attachments.length} attachment(s)`}
                                    </Text>
                                    <Text variant="text-xs/normal" className="xbt-row-meta">
                                        {new Date(item.savedAt).toLocaleString()}
                                    </Text>
                                </div>
                                <div className="xbt-row-actions">
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => {
                                            jumpToMessage(item.channelId, item.messageId);
                                            close();
                                        }}
                                    >
                                        Jump
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => copyWithToast(item.content, "Message copied")}
                                    >
                                        Copy
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="dangerSecondary"
                                        onClick={() => saved.delete(item.id)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
        </>
    );
}

export function openSavedModal() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Saved messages"
                subtitle="Your own bookmarks, stored on this machine"
                size="lg"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <SavedList close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}
