/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { Modal, openModal, Text, TextArea, TextInput, useState } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";

export interface Snippet {
    name: string;
    content: string;
    uses: number;
}

export const snippets = new PersistedRecord<Snippet>("Xbtcord_Snippets");

/** Names are the lookup key, so they are matched case-insensitively. */
export function findSnippet(name: string): Snippet | undefined {
    const needle = name.trim().toLowerCase();
    return Object.values(snippets.all).find(s => s.name.toLowerCase() === needle);
}

export function saveSnippet(name: string, content: string) {
    const existing = findSnippet(name);
    snippets.set(existing?.name ?? name.trim(), {
        name: existing?.name ?? name.trim(),
        content,
        uses: existing?.uses ?? 0
    });
}

export function recordUse(snippet: Snippet) {
    snippets.set(snippet.name, { ...snippet, uses: snippet.uses + 1 });
}

function SnippetManager({ close }: { close(): void; }) {
    const all = snippets.use();
    const [name, setName] = useState("");
    const [content, setContent] = useState("");

    const items = Object.values(all).sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

    return (
        <>
            <div className="xbt-form">
                <TextInput value={name} onChange={setName} placeholder="Name, e.g. gm" fullWidth />
                <TextArea value={content} onChange={setContent} placeholder="What it expands to" rows={3} />
                <div className="xbt-form-row">
                    <div />
                    <Button
                        size="small"
                        disabled={!name.trim() || !content.trim()}
                        onClick={() => {
                            saveSnippet(name, content);
                            setName("");
                            setContent("");
                        }}
                    >
                        Save snippet
                    </Button>
                </div>
            </div>

            {!items.length
                ? <div className="xbt-empty">No snippets yet. Add one above, then use <b>/snippet</b>.</div>
                : (
                    <div className="xbt-list">
                        {items.map(snippet => (
                            <div className="xbt-row" key={snippet.name}>
                                <div className="xbt-row-body">
                                    <Text variant="text-sm/semibold">
                                        {snippet.name} <span className="xbt-tag">{snippet.uses} uses</span>
                                    </Text>
                                    <Text variant="text-sm/normal" className="xbt-row-preview">{snippet.content}</Text>
                                </div>
                                <div className="xbt-row-actions">
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => {
                                            insertTextIntoChatInputBox(snippet.content);
                                            recordUse(snippet);
                                            close();
                                        }}
                                    >
                                        Insert
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => {
                                            setName(snippet.name);
                                            setContent(snippet.content);
                                        }}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="dangerSecondary"
                                        onClick={() => snippets.delete(snippet.name)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
        </>
    );
}

export function openSnippetsModal() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Snippets"
                subtitle="Text you retype often, kept one keystroke away"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <SnippetManager close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}
