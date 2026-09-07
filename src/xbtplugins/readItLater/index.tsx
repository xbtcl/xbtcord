/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, openModal, showToast, Toasts } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Item {
    channelId: string;
    messageId: string;
    where: string;
    author: string;
    preview: string;
    savedAt: number;
}

const queue = new PersistedRecord<Item>("Xbtcord_ReadItLater");

const settings = definePluginSettings({
    confirmOnOpen: {
        type: OptionType.BOOLEAN,
        description: "Take an item off the list as soon as you open it",
        default: true
    }
});

/*
 * SavedMessages keeps things you want to keep. This keeps things you have not read yet,
 * which is a different pile with a different lifecycle - an item leaves this one the
 * moment you open it, and that is the point.
 */
function save(message: Message) {
    const id = `${message.channel_id}-${message.id}`;

    if (queue.has(id)) {
        queue.delete(id);
        showToast("Taken off the list", Toasts.Type.MESSAGE);
        return;
    }

    queue.set(id, {
        channelId: message.channel_id,
        messageId: message.id,
        where: describeChannel(message.channel_id),
        author: message.author?.username ?? "someone",
        preview: (message.content ?? "").slice(0, 160) || "(no text)",
        savedAt: Date.now()
    });

    showToast("Saved for later", Toasts.Type.SUCCESS);
}

function QueueModal(props: any) {
    queue.use();

    const entries = queue.entries.sort((a, b) => a[1].savedAt - b[1].savedAt);

    return (
        <XbtModal props={props} title="Read it later" subtitle={`${entries.length} waiting`} size="lg">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, item]) => (
                        <Row
                            key={id}
                            title={`${item.author} in ${item.where}`}
                            preview={item.preview}
                            meta={`saved ${ago(item.savedAt)}`}
                            actions={[
                                {
                                    label: "Open",
                                    onClick: () => {
                                        jumpToMessage(item.channelId, item.messageId);
                                        if (settings.store.confirmOnOpen) queue.delete(id);
                                        props.onClose();
                                    }
                                },
                                { label: "Drop", danger: true, onClick: () => queue.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing waiting. Use the message button to add something.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => queue.clear()}>Clear the list</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "ReadItLater",
    description: "A queue of messages to come back to, which empties itself as you open them",
    tags: ["Utility", "Organisation"],
    searchTerms: ["read", "later", "queue", "bookmark", "save", "backlog"],
    authors: [Devs.Xbtcord],
    settings,

    messagePopoverButton: {
        icon: ClockIcon,
        render(message: Message) {
            const saved = queue.has(`${message.channel_id}-${message.id}`);

            return {
                key: "xbt-read-it-later",
                label: saved ? "Take off the read later list" : "Read this later",
                icon: ClockIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => save(message)
            };
        }
    },

    toolboxActions: {
        "Read it later": () => openModal(props => <QueueModal {...props} />)
    },

    start: () => queue.load()
});
