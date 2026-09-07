/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { CopyIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import { makeCodeblock } from "@utils/text";
import definePlugin from "@utils/types";
import { ChannelStore, openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel } from "@xbtplugins/_shared/util";

interface Snippet {
    code: string;
    language: string;
    from: string;
    at: number;
}

const vault = new PersistedRecord<Snippet>("Xbtcord_CodeVault");

/** Fenced blocks only. An inline `x` is rarely worth keeping and would flood the list. */
const FENCE = /```(\w+)?\n?([\s\S]*?)```/g;

function blocksIn(content: string) {
    return [...content.matchAll(FENCE)]
        .map(match => ({ language: match[1] ?? "", code: match[2].trim() }))
        .filter(block => block.code.length > 0);
}

function VaultModal(props: any) {
    vault.use();

    const [query, setQuery] = useState("");
    const needle = query.toLowerCase();

    const entries = vault.entries
        .filter(([, snippet]) => !needle
            || snippet.code.toLowerCase().includes(needle)
            || snippet.language.toLowerCase().includes(needle)
            || snippet.from.toLowerCase().includes(needle))
        .sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Code vault" subtitle={`${vault.entries.length} snippet(s) kept`} size="lg">
            <div className="xbt-form">
                <TextInput value={query} onChange={setQuery} placeholder="Search the code..." />
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, snippet]) => (
                        <Row
                            key={id}
                            title={snippet.language || "plain text"}
                            preview={snippet.code.split("\n")[0].slice(0, 120)}
                            meta={`${snippet.from} - ${ago(snippet.at)} - ${snippet.code.split("\n").length} lines`}
                            actions={[
                                { label: "Copy", onClick: () => copyWithToast(snippet.code) },
                                {
                                    label: "Paste",
                                    onClick: () => {
                                        insertTextIntoChatInputBox(makeCodeblock(snippet.code, snippet.language));
                                        props.onClose();
                                    }
                                },
                                { label: "Remove", danger: true, onClick: () => vault.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing saved. Hover a message with a code block and press the save button.</Empty>
                }
            </div>
        </XbtModal>
    );
}

const open = () => openModal(props => <VaultModal {...props} />);

export default definePlugin({
    name: "CodeVault",
    description: "Keeps code blocks out of messages in a searchable list you can paste back into any channel",
    tags: ["Utility", "Developers", "Organisation"],
    searchTerms: ["code", "snippet", "vault", "save", "codeblock", "paste"],
    authors: [Devs.Xbtcord],

    messagePopoverButton: {
        icon: CopyIcon,
        render(message: Message) {
            const blocks = blocksIn(message.content ?? "");
            if (!blocks.length) return null;

            return {
                key: "xbt-code-vault",
                label: blocks.length === 1 ? "Save this code" : `Save ${blocks.length} code blocks`,
                icon: CopyIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick() {
                    const from = `${message.author?.username ?? "someone"} in ${describeChannel(message.channel_id)}`;
                    for (const block of blocks) {
                        vault.set(makeId(), { ...block, from, at: Date.now() });
                    }
                    showToast(`Saved ${blocks.length} snippet(s)`, Toasts.Type.SUCCESS);
                }
            };
        }
    },

    toolboxActions: {
        "Code vault": open
    },

    start: () => vault.load()
});
