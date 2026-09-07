/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin from "@utils/types";
import { openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Macro {
    /** A normalised chord, like "ctrl+alt+g". */
    chord: string;
    text: string;
}

const macros = new PersistedRecord<Macro>("Xbtcord_KeybindMacros");

/** Turns a key event into the same shape the stored chords use. */
function chordOf(event: KeyboardEvent): string {
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.altKey) parts.push("alt");
    if (event.shiftKey) parts.push("shift");
    if (event.metaKey) parts.push("meta");

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    if (["control", "alt", "shift", "meta"].includes(key)) return "";

    parts.push(key);
    return parts.join("+");
}

function onKeyDown(event: KeyboardEvent) {
    // A bare letter is not a macro - that would eat normal typing. At least one modifier
    // is required, which is also why the recorder below refuses to save one without.
    if (!event.ctrlKey && !event.altKey && !event.metaKey) return;

    const chord = chordOf(event);
    if (!chord) return;

    const match = macros.entries.find(([, macro]) => macro.chord === chord);
    if (!match) return;

    event.preventDefault();
    event.stopPropagation();
    insertTextIntoChatInputBox(match[1].text);
}

function Recorder({ value, onChange }: { value: string; onChange: (chord: string) => void; }) {
    const [listening, setListening] = useState(false);

    return (
        <Button
            size="small"
            variant={listening ? "positive" : "secondary"}
            onClick={() => setListening(true)}
            onKeyDown={(event: any) => {
                if (!listening) return;
                event.preventDefault();

                const chord = chordOf(event.nativeEvent ?? event);
                if (!chord) return;

                if (!/(ctrl|alt|meta)\+/.test(chord)) {
                    showToast("Use at least Ctrl or Alt, or it will fire while you type", Toasts.Type.FAILURE);
                    return;
                }

                onChange(chord);
                setListening(false);
            }}
        >
            {listening ? "Press a combination..." : value || "Set a shortcut"}
        </Button>
    );
}

function MacrosModal(props: any) {
    macros.use();

    const [chord, setChord] = useState("");
    const [text, setText] = useState("");

    return (
        <XbtModal props={props} title="Keyboard macros" subtitle="A shortcut drops its text straight into the chat box">
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <TextInput value={text} onChange={setText} placeholder="Text to insert" />
                    <Recorder value={chord} onChange={setChord} />
                    <Button
                        size="small"
                        disabled={!chord || !text.trim()}
                        onClick={() => {
                            macros.set(makeId(), { chord, text });
                            setChord("");
                            setText("");
                        }}
                    >
                        Add
                    </Button>
                </div>
            </div>

            <div className="xbt-list">
                {macros.entries.length
                    ? macros.entries.map(([id, macro]) => (
                        <Row
                            key={id}
                            title={<span className="xbt-tag">{macro.chord}</span>}
                            preview={macro.text}
                            actions={[{ label: "Remove", danger: true, onClick: () => macros.delete(id) }]}
                        />
                    ))
                    : <Empty>No macros yet.</Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "KeybindMacros",
    description: "Bind your own keyboard shortcuts to snippets of text and drop them into the chat box",
    tags: ["Shortcuts", "Utility", "Chat"],
    searchTerms: ["keybind", "macro", "shortcut", "hotkey", "snippet", "text"],
    authors: [Devs.Xbtcord],

    toolboxActions: {
        "Keyboard macros": () => openModal(props => <MacrosModal {...props} />)
    },

    async start() {
        await macros.load();
        window.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
