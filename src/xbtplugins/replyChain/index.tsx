/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { MessageStore, RestAPI, Text, useEffect, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { jumpToMessage } from "@xbtplugins/_shared/util";

const logger = new Logger("ReplyChain");

const settings = definePluginSettings({
    maxDepth: {
        type: OptionType.SLIDER,
        description: "How far up the chain to walk",
        markers: [3, 5, 10, 15, 25],
        default: 10,
        stickToMarkers: true
    },
    fetchMissing: {
        type: OptionType.BOOLEAN,
        description: "Ask Discord for messages that have scrolled out of the cache (slower, but the chain is usually complete)",
        default: true
    }
});

interface Link {
    id: string;
    channelId: string;
    author: string;
    content: string;
}

function reference(message: any): { messageId?: string; channelId?: string; } | null {
    const ref = message?.messageReference ?? message?.message_reference;
    if (!ref) return null;
    return { messageId: ref.messageId ?? ref.message_id, channelId: ref.channelId ?? ref.channel_id };
}

/** Cache of things we had to go to the API for, so reopening a chain is instant. */
const fetched = new Map<string, any>();

async function lookup(channelId: string, messageId: string): Promise<any | null> {
    const cached = MessageStore.getMessage(channelId, messageId);
    if (cached) return cached;

    const key = `${channelId}:${messageId}`;
    if (fetched.has(key)) return fetched.get(key);
    if (!settings.store.fetchMissing) return null;

    try {
        // `around` with a limit of 1 is the cheapest way to ask for one specific message
        // without needing the Manage Messages permission that GET /messages/:id wants.
        const response = await RestAPI.get({
            url: `/channels/${channelId}/messages`,
            query: { around: messageId, limit: 1 }
        });

        const found = (response.body as any[])?.find(m => m.id === messageId) ?? null;
        fetched.set(key, found);
        return found;
    } catch (err) {
        logger.warn("Couldn't fetch a message in the chain", err);
        fetched.set(key, null);
        return null;
    }
}

async function walk(message: any): Promise<Link[]> {
    const chain: Link[] = [];
    const seen = new Set<string>([message.id]);

    let current = message;

    for (let depth = 0; depth < settings.store.maxDepth; depth++) {
        const ref = reference(current);
        if (!ref?.messageId || !ref.channelId) break;
        if (seen.has(ref.messageId)) break;
        seen.add(ref.messageId);

        const parent = await lookup(ref.channelId, ref.messageId);
        if (!parent) break;

        chain.push({
            id: parent.id,
            channelId: ref.channelId,
            author: parent.author?.username ?? "Unknown",
            content: parent.content || "(no text)"
        });

        current = parent;
    }

    return chain;
}

function Chain({ message }: { message: Message; }) {
    const [open, setOpen] = useState(false);
    const [chain, setChain] = useState<Link[] | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || chain || loading) return;

        setLoading(true);
        walk(message)
            .then(setChain)
            .catch(err => {
                logger.error("Failed to walk the chain", err);
                setChain([]);
            })
            .finally(() => setLoading(false));
    }, [open]);

    if (!reference(message)) return null;

    if (!open) {
        return (
            <button className="xbt-chain-toggle" onClick={() => setOpen(true)}>
                Show reply chain
            </button>
        );
    }

    return (
        <div className="xbt-chain">
            <button className="xbt-chain-toggle" onClick={() => setOpen(false)}>Hide reply chain</button>
            {loading && <Text variant="text-xs/normal" className="xbt-chain-meta">Loading…</Text>}
            {chain?.length === 0 && !loading && (
                <Text variant="text-xs/normal" className="xbt-chain-meta">
                    Couldn't find the message this replies to - it may have been deleted.
                </Text>
            )}
            {chain?.map((link, index) => (
                <div
                    className="xbt-chain-link"
                    key={link.id}
                    style={{ marginInlineStart: `${index * 10}px` }}
                    onClick={() => jumpToMessage(link.channelId, link.id)}
                >
                    <span className="xbt-chain-author">{link.author}</span>
                    <span className="xbt-chain-content">{link.content}</span>
                </div>
            ))}
        </div>
    );
}

export default definePlugin({
    name: "ReplyChainViewer",
    description: "Expands the whole chain of replies above a message, so you can read a thread without hunting up the channel",
    tags: ["Chat", "Utility"],
    searchTerms: ["reply", "chain", "thread", "context", "conversation"],
    authors: [Devs.Xbtcord],
    settings,

    renderMessageAccessory: ({ message }) => (
        <ErrorBoundary noop>
            <Chain message={message} />
        </ErrorBoundary>
    ),

    stop() {
        fetched.clear();
    }
});
