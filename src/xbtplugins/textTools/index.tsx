/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Button } from "@components/Button";
import { PencilIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin from "@utils/types";
import { openModal, TextArea, useState } from "@webpack/common";
import { XbtModal } from "@xbtplugins/_shared/ui";

const FLIPPED = "ɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎz";
const SMALL_CAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘQʀꜱᴛᴜᴠᴡxʏᴢ";
const ZALGO = ["\u0300", "\u0301", "\u0334", "\u0489", "\u0353", "\u0330", "\u0322"];

/** Maps a-z through a lookup string, leaving everything else alone. */
function mapAlphabet(text: string, alphabet: string) {
    return [...text.toLowerCase()].map(character => {
        const index = character.charCodeAt(0) - 97;
        return index >= 0 && index < 26 ? alphabet[index] : character;
    }).join("");
}

const TRANSFORMS: { name: string; hint: string; apply: (text: string) => string; }[] = [
    { name: "Upside down", hint: "ʇxǝʇ", apply: text => [...mapAlphabet(text, FLIPPED)].reverse().join("") },
    { name: "Small caps", hint: "ᴛᴇxᴛ", apply: text => mapAlphabet(text, SMALL_CAPS) },
    { name: "Mocking", hint: "tExT", apply: text => [...text].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join("") },
    { name: "Spaced", hint: "t e x t", apply: text => [...text].join(" ") },
    { name: "Reversed", hint: "txet", apply: text => [...text].reverse().join("") },
    { name: "Rot13", hint: "grkg", apply: text => text.replace(/[a-z]/gi, c => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    }) },
    { name: "Base64", hint: "dGV4dA==", apply: text => btoa(unescape(encodeURIComponent(text))) },
    { name: "Zalgo", hint: "t̸e̷x̶t̴", apply: text => [...text].map(c => c + ZALGO[Math.floor(Math.random() * ZALGO.length)]).join("") },
    { name: "Every letter spoilered", hint: "||t||||e||", apply: text => [...text].map(c => `||${c}||`).join("") }
];

function TextToolsModal(props: any) {
    const [input, setInput] = useState("");

    return (
        <XbtModal props={props} title="Text tools" subtitle="Type once, pick a shape, drop it in the chat box" size="md">
            <div className="xbt-form">
                <TextArea
                    value={input}
                    onChange={setInput}
                    placeholder="Type something..."
                    rows={3}
                    autosize={false}
                />
            </div>

            <div className="xbt-list">
                {TRANSFORMS.map(transform => {
                    const output = input ? transform.apply(input) : transform.hint;
                    return (
                        <div className="xbt-row" key={transform.name}>
                            <div className="xbt-row-body">
                                <div>{transform.name}</div>
                                <div className="xbt-row-preview">{output}</div>
                            </div>
                            <div className="xbt-row-actions">
                                <Button size="small" variant="secondary" disabled={!input} onClick={() => copyWithToast(output)}>
                                    Copy
                                </Button>
                                <Button
                                    size="small"
                                    variant="primary"
                                    disabled={!input}
                                    onClick={() => { insertTextIntoChatInputBox(output); props.onClose(); }}
                                >
                                    Insert
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </XbtModal>
    );
}

function open() {
    openModal(props => <TextToolsModal {...props} />);
}

const renderButton: ChatBarButtonFactory = ({ isMainChat }) =>
    isMainChat
        ? <ChatBarButton tooltip="Text tools" onClick={open}><PencilIcon /></ChatBarButton>
        : null;

export default definePlugin({
    name: "TextTools",
    description: "A chat bar button that rewrites what you type - upside down, small caps, mocking, zalgo, rot13 and more",
    tags: ["Fun", "Utility"],
    searchTerms: ["text", "font", "upside", "mock", "zalgo", "rot13", "base64", "smallcaps"],
    authors: [Devs.Xbtcord],

    chatBarButton: {
        render: renderButton,
        icon: PencilIcon
    },

    toolboxActions: {
        "Text tools": open
    }
});
