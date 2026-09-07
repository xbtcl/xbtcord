/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Devs } from "@utils/constants";
import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, XbtModal } from "@xbtplugins/_shared/ui";

interface Saved {
    name: string;
    animated: boolean;
    savedAt: number;
}

const vault = new PersistedRecord<Saved>("Xbtcord_EmojiVault");

const CUSTOM_EMOJI = /<(a?):(\w+):(\d+)>/g;

function markdown(id: string, saved: Saved) {
    return `<${saved.animated ? "a" : ""}:${saved.name}:${id}>`;
}

function urlFor(id: string, saved: Saved) {
    return `https://cdn.discordapp.com/emojis/${id}.${saved.animated ? "gif" : "png"}?size=64`;
}

/*
 * Without Nitro, pasting the markdown for an emoji from another server sends the literal
 * text rather than the emoji - so the vault offers the image link too, which works for
 * everyone. FakeNitro handles the other half if you have it turned on.
 */
function VaultModal(props: any) {
    vault.use();

    const [query, setQuery] = useState("");
    const needle = query.toLowerCase();

    const entries = vault.entries
        .filter(([, saved]) => !needle || saved.name.toLowerCase().includes(needle))
        .sort((a, b) => b[1].savedAt - a[1].savedAt);

    return (
        <XbtModal props={props} title="Emoji vault" subtitle={`${vault.entries.length} kept`} size="lg">
            <div className="xbt-form">
                <TextInput value={query} onChange={setQuery} placeholder="Search by name..." />
            </div>

            {entries.length
                ? (
                    <div className="xbt-emoji-grid">
                        {entries.map(([id, saved]) => (
                            <button
                                key={id}
                                className="xbt-emoji-tile"
                                title={`${saved.name} - click to paste, right click to copy the link`}
                                onClick={() => { insertTextIntoChatInputBox(markdown(id, saved)); props.onClose(); }}
                                onContextMenu={event => {
                                    event.preventDefault();
                                    copyWithToast(urlFor(id, saved), "Image link copied");
                                }}
                                onAuxClick={event => {
                                    if (event.button !== 1) return;
                                    event.preventDefault();
                                    vault.delete(id);
                                }}
                            >
                                <img src={urlFor(id, saved)} alt={saved.name} />
                                <span>{saved.name}</span>
                            </button>
                        ))}
                    </div>
                )
                : <Empty>Nothing saved. Right click a message with custom emoji in it.</Empty>
            }
        </XbtModal>
    );
}

export default definePlugin({
    name: "EmojiVault",
    description: "Saves custom emoji you come across, from any server, and pastes them or their image link back later",
    tags: ["Emotes", "Utility", "Organisation"],
    searchTerms: ["emoji", "emote", "vault", "save", "steal", "collection"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            const found = [...(message?.content ?? "").matchAll(CUSTOM_EMOJI)];
            if (!found.length) return;

            const unique = new Map(found.map(match => [match[3], { name: match[2], animated: match[1] === "a" }]));

            children.push(
                <Menu.MenuItem
                    id="xbt-emoji-vault-save"
                    label={unique.size === 1 ? "Save this emoji" : `Save ${unique.size} emoji`}
                    action={() => {
                        for (const [id, info] of unique) vault.set(id, { ...info, savedAt: Date.now() });
                        showToast(`Saved ${unique.size}`, Toasts.Type.SUCCESS);
                    }}
                />
            );
        }
    },

    toolboxActions: {
        "Emoji vault": () => openModal(props => <VaultModal {...props} />)
    },

    start: () => vault.load()
});
