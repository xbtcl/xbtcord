/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { NotesIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel, getCurrentGuild } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, Modal, openModal, TextArea, useEffect, useState } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";

interface Note {
    text: string;
    updatedAt: number;
}

const notes = new PersistedRecord<Note>("Xbtcord_QuickNotes");

/**
 * Notes are keyed by what they are attached to, so a channel note and a server note can
 * coexist for the same place without one shadowing the other.
 */
function keyFor(scope: "global" | "guild" | "channel", id?: string) {
    return scope === "global" ? "global" : `${scope}:${id}`;
}

function NoteEditor({ storageKey }: { storageKey: string; }) {
    const all = notes.use();
    const stored = all[storageKey]?.text ?? "";
    const [text, setText] = useState(stored);

    // Switching scope inside an open modal has to reload the text, and an outside edit
    // (another note saved elsewhere) should not clobber what is being typed here.
    useEffect(() => setText(stored), [storageKey]);

    return (
        <TextArea
            value={text}
            onChange={value => {
                setText(value);
                notes.set(storageKey, { text: value, updatedAt: Date.now() });
            }}
            placeholder="Type anything. It saves as you go, and never leaves this machine."
            rows={14}
            autosize={false}
        />
    );
}

function NotesModal(props: any) {
    const channel = getCurrentChannel();
    const guild = getCurrentGuild();

    const scopes = [
        { key: keyFor("global"), label: "Everything" },
        guild && { key: keyFor("guild", guild.id), label: guild.name },
        channel && { key: keyFor("channel", channel.id), label: channel.name ? `#${channel.name}` : "This DM" }
    ].filter(Boolean) as { key: string; label: string; }[];

    const [active, setActive] = useState(scopes[scopes.length - 1].key);

    return (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Notes"
                subtitle="A scratchpad that follows wherever you are"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <div className="xbt-form">
                    <div className="xbt-form-row">
                        <div />
                        {scopes.map(scope => (
                            <button
                                key={scope.key}
                                className={`xbt-tag${active === scope.key ? " xbt-tag-active" : ""}`}
                                onClick={() => setActive(scope.key)}
                            >
                                {scope.label}
                            </button>
                        ))}
                    </div>
                </div>
                <NoteEditor storageKey={active} />
            </Modal>
        </ErrorBoundary>
    );
}

function openNotes() {
    openModal(props => <NotesModal {...props} />);
}

function hasNote(key: string) {
    return !!notes.get(key)?.text.trim();
}

export default definePlugin({
    name: "QuickNotes",
    description: "A private scratchpad per channel, per server, and one for everything else",
    tags: ["Utility", "Organisation"],
    searchTerms: ["notes", "notepad", "scratchpad", "memo", "todo"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel: any; }) => {
            if (!channel) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-channel-note"
                    label={hasNote(keyFor("channel", channel.id)) ? "Edit note" : "Add a note"}
                    icon={NotesIcon}
                    action={openNotes}
                />
            );
        },
        "guild-context": (children, { guild }: { guild: any; }) => {
            if (!guild) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-guild-note"
                    label={hasNote(keyFor("guild", guild.id)) ? "Edit note" : "Add a note"}
                    icon={NotesIcon}
                    action={openNotes}
                />
            );
        }
    },

    toolboxActions: {
        "Notes": openNotes
    },

    start: () => notes.load()
});
