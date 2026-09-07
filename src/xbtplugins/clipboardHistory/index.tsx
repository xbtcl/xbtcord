/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, TextInput, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Clip {
    text: string;
    at: number;
}

const clips = new PersistedRecord<Clip>("Xbtcord_ClipboardHistory");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many clips to keep",
        default: 50
    },
    maxLength: {
        type: OptionType.NUMBER,
        description: "Ignore anything longer than this many characters",
        default: 4000
    }
});

/*
 * This only sees copies made inside the Discord window - there is no way for a page to
 * watch the system clipboard, and there should not be. So it is not a full clipboard
 * manager; it is a history of what you copied out of Discord, which is the thing you
 * actually go looking for ten minutes later.
 */
function onCopy() {
    // The selection has to be read synchronously; navigator.clipboard.readText would
    // prompt and would also pick up things copied elsewhere.
    const text = document.getSelection()?.toString() ?? "";
    if (!text.trim() || text.length > settings.store.maxLength) return;

    const existing = clips.entries.find(([, clip]) => clip.text === text);
    if (existing) {
        clips.set(existing[0], { text, at: Date.now() });
    } else {
        clips.set(makeId(), { text, at: Date.now() });
    }

    const limit = Math.max(5, settings.store.keep);
    const sorted = clips.entries.sort((a, b) => b[1].at - a[1].at);
    for (const [id] of sorted.slice(limit)) clips.delete(id);
}

function HistoryModal(props: any) {
    clips.use();

    const [query, setQuery] = useState("");
    const needle = query.toLowerCase();

    const entries = clips.entries
        .filter(([, clip]) => !needle || clip.text.toLowerCase().includes(needle))
        .sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Clipboard history" subtitle="Everything you copied out of Discord" size="lg">
            <div className="xbt-form">
                <TextInput value={query} onChange={setQuery} placeholder="Search..." />
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, clip]) => (
                        <Row
                            key={id}
                            title={clip.text.split("\n")[0].slice(0, 100)}
                            meta={ago(clip.at)}
                            actions={[
                                { label: "Copy", onClick: () => copyWithToast(clip.text) },
                                { label: "Paste", onClick: () => { insertTextIntoChatInputBox(clip.text); props.onClose(); } },
                                { label: "Remove", danger: true, onClick: () => clips.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing copied yet.</Empty>
                }
            </div>

            {!!clips.entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => clips.clear()}>Clear it all</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "ClipboardHistory",
    description: "Keeps what you copy inside Discord, so the link you copied ten minutes ago is still there",
    tags: ["Utility", "Organisation"],
    searchTerms: ["clipboard", "copy", "history", "paste", "recent"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Clipboard history": () => openModal(props => <HistoryModal {...props} />)
    },

    async start() {
        await clips.load();
        document.addEventListener("copy", onCopy, true);
        document.addEventListener("cut", onCopy, true);
    },

    stop() {
        document.removeEventListener("copy", onCopy, true);
        document.removeEventListener("cut", onCopy, true);
    }
});
