/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import { LinkIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, openModal, showToast, TextInput, Toasts, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Saved {
    url: string;
    note: string;
    from: string;
    channelId?: string;
    messageId?: string;
    at: number;
}

const links = new PersistedRecord<Saved>("Xbtcord_LinkVault");

const URL_PATTERN = /https?:\/\/[^\s<>()]+/g;

function save(url: string, from: string, channelId?: string, messageId?: string) {
    links.set(makeId(), { url, note: "", from, channelId, messageId, at: Date.now() });
    showToast("Saved to the link vault", Toasts.Type.SUCCESS);
}

function VaultModal(props: any) {
    links.use();

    const [query, setQuery] = useState("");

    const entries = links.entries
        .filter(([, saved]) => {
            const needle = query.toLowerCase();
            return !needle
                || saved.url.toLowerCase().includes(needle)
                || saved.note.toLowerCase().includes(needle)
                || saved.from.toLowerCase().includes(needle);
        })
        .sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Link vault" subtitle={`${links.entries.length} saved`} size="lg">
            <div className="xbt-form">
                <TextInput value={query} onChange={setQuery} placeholder="Search the vault..." />
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, saved]) => (
                        <Row
                            key={id}
                            title={saved.url}
                            preview={saved.note || undefined}
                            meta={`from ${saved.from} - ${ago(saved.at)}`}
                            actions={[
                                { label: "Copy", onClick: () => copyWithToast(saved.url) },
                                {
                                    label: "Open",
                                    onClick: () => XbtcordNative.native.openExternal(saved.url)
                                },
                                ...(saved.channelId
                                    ? [{
                                        label: "Jump",
                                        onClick: () => { jumpToMessage(saved.channelId!, saved.messageId); props.onClose(); }
                                    }]
                                    : []),
                                { label: "Remove", danger: true, onClick: () => links.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>
                        Nothing saved yet. Right click a message with a link in it and pick Save link.
                    </Empty>
                }
            </div>

            {!!links.entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={() => copyWithToast(
                            links.entries.sort((a, b) => b[1].at - a[1].at).map(([, saved]) => saved.url).join("\n"),
                            "Every link copied")}
                    >
                        Copy them all
                    </Button>
                </div>
            )}
        </XbtModal>
    );
}

const open = () => openModal(props => <VaultModal {...props} />);

export default definePlugin({
    name: "LinkVault",
    description: "Saves links out of messages into a searchable list, so a good one is not lost the moment the channel moves on",
    tags: ["Utility", "Organisation"],
    searchTerms: ["link", "url", "bookmark", "save", "vault", "later"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            const found = [...new Set((message?.content ?? "").match(URL_PATTERN) ?? [])];
            if (!found.length) return;

            const from = `${message!.author?.username ?? "someone"} in ${describeChannel(message!.channel_id)}`;

            children.push(
                found.length === 1
                    ? <Menu.MenuItem
                        id="xbt-link-vault-save"
                        label="Save link"
                        icon={LinkIcon}
                        action={() => save(found[0], from, message!.channel_id, message!.id)}
                    />
                    : <Menu.MenuItem id="xbt-link-vault" label={`Save a link (${found.length})`} icon={LinkIcon}>
                        {found.map((url, index) => (
                            <Menu.MenuItem
                                key={url}
                                id={`xbt-link-vault-${index}`}
                                label={url.length > 60 ? `${url.slice(0, 57)}...` : url}
                                action={() => save(url, from, message!.channel_id, message!.id)}
                            />
                        ))}
                        <Menu.MenuItem
                            id="xbt-link-vault-all"
                            label="Save all of them"
                            action={() => found.forEach(url => save(url, from, message!.channel_id, message!.id))}
                        />
                    </Menu.MenuItem>
            );
        }
    },

    toolboxActions: {
        "Link vault": open
    },

    start: () => links.load()
});
