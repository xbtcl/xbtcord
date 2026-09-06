/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { MessageStore, Modal, openModal, Text, TextInput, useMemo, useState } from "@webpack/common";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

const settings = definePluginSettings({
    defaultRegex: {
        type: OptionType.BOOLEAN,
        description: "Start with regex mode on",
        default: false
    },
    hotkey: {
        type: OptionType.BOOLEAN,
        description: "Open with Ctrl+Shift+F",
        default: true
    }
});

interface Hit {
    id: string;
    author: string;
    content: string;
    timestamp: number;
}

/**
 * Only what the client already has.
 *
 * Discord's own search is server side, which means it ignores case, ignores punctuation and
 * cannot do regex - fine for "find that link from March", useless for "which of these forty
 * messages said exactly `--force`". This searches the messages already loaded in the
 * channel, so it is exact, instant, and honest about its limit: scroll further back first
 * if you want more of the history in range.
 */
function search(channelId: string, query: string, useRegex: boolean, caseSensitive: boolean, author: string): Hit[] {
    if (!query.trim()) return [];

    let test: (content: string) => boolean;

    if (useRegex) {
        try {
            const re = new RegExp(query, caseSensitive ? "" : "i");
            test = content => re.test(content);
        } catch {
            return [];
        }
    } else {
        const needle = caseSensitive ? query : query.toLowerCase();
        test = content => (caseSensitive ? content : content.toLowerCase()).includes(needle);
    }

    const messages: any[] = MessageStore.getMessages(channelId)?.toArray?.() ?? [];
    const authorNeedle = author.trim().toLowerCase();

    return messages
        .filter(m => m.content && test(m.content))
        .filter(m => !authorNeedle || m.author?.username?.toLowerCase().includes(authorNeedle))
        .map(m => ({
            id: m.id,
            author: m.author?.username ?? "Unknown",
            content: m.content,
            timestamp: new Date(m.timestamp).getTime()
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
}

function SearchPanel({ channelId, initial, close }: { channelId: string; initial: string; close(): void; }) {
    const [query, setQuery] = useState(initial);
    const [author, setAuthor] = useState("");
    const [useRegex, setUseRegex] = useState(settings.store.defaultRegex);
    const [caseSensitive, setCaseSensitive] = useState(false);

    const hits = useMemo(
        () => search(channelId, query, useRegex, caseSensitive, author),
        [channelId, query, author, useRegex, caseSensitive]
    );

    const loaded = MessageStore.getMessages(channelId)?.toArray?.()?.length ?? 0;

    return (
        <>
            <div className="xbt-form">
                <TextInput value={query} onChange={setQuery} placeholder="Text, or a regex" fullWidth clearable autoFocus />
                <div className="xbt-form-row">
                    <TextInput value={author} onChange={setAuthor} placeholder="From (optional)" fullWidth />
                    <Button size="small" variant={useRegex ? "primary" : "secondary"} onClick={() => setUseRegex(v => !v)}>
                        Regex
                    </Button>
                    <Button size="small" variant={caseSensitive ? "primary" : "secondary"} onClick={() => setCaseSensitive(v => !v)}>
                        Aa
                    </Button>
                </div>
                <Text variant="text-xs/normal" className="xbt-row-meta">
                    {hits.length} of {loaded} loaded messages. Scroll further up the channel to widen the net.
                </Text>
            </div>

            {!hits.length
                ? <div className="xbt-empty">Nothing matched.</div>
                : (
                    <div className="xbt-list">
                        {hits.slice(0, 200).map(hit => (
                            <div className="xbt-row" key={hit.id}>
                                <div className="xbt-row-body">
                                    <Text variant="text-sm/semibold">{hit.author}</Text>
                                    <Text variant="text-sm/normal" className="xbt-row-preview">{hit.content}</Text>
                                    <Text variant="text-xs/normal" className="xbt-row-meta">
                                        {new Date(hit.timestamp).toLocaleString()}
                                    </Text>
                                </div>
                                <div className="xbt-row-actions">
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => {
                                            jumpToMessage(channelId, hit.id);
                                            close();
                                        }}
                                    >
                                        Jump
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
        </>
    );
}

function openSearch(initial = "") {
    const channel = getCurrentChannel();
    if (!channel) return;

    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title={`Search ${describeChannel(channel.id)}`}
                subtitle="Exact, case-aware and regex-capable, over what is already loaded"
                size="lg"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <SearchPanel channelId={channel.id} initial={initial} close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

function onKeyDown(event: KeyboardEvent) {
    if (!settings.store.hotkey) return;
    if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "f") return;

    event.preventDefault();
    openSearch();
}

export default definePlugin({
    name: "LocalSearch",
    description: "Search the messages already loaded in a channel, with real regex and case sensitivity",
    tags: ["Chat", "Utility", "Shortcuts"],
    searchTerms: ["search", "find", "regex", "ctrl+f", "filter"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],
    settings,

    commands: [
        {
            name: "find",
            description: "Search the messages loaded in this channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "query",
                    description: "Text or a regex",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args) {
                openSearch(findOption(args, "query", ""));
            }
        }
    ],

    toolboxActions: {
        "Search this channel": () => openSearch()
    },

    start() {
        window.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
