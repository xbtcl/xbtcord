/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, MessageStore, openModal, ReadStateStore } from "@webpack/common";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { jumpToMessage } from "@xbtplugins/_shared/util";

/*
 * Reads only what the client already has in memory.
 *
 * MessageStore holds the messages for channels you have opened this session, which is
 * exactly the set worth peeking at - it needs no request, cannot be rate limited, and
 * cannot mark anything as read by accident. For a channel that has never been opened
 * there is honestly nothing to show, and it says so rather than fetching behind your back
 * and quietly acknowledging the unread count.
 */
function PeekModal({ channelId, name, ...props }: { channelId: string; name: string; } & any) {
    const messages = (MessageStore.getMessages(channelId) as any)?.toArray?.() ?? [];
    const recent = messages.slice(-15).reverse();
    const unread = ReadStateStore.getUnreadCount(channelId) ?? 0;

    return (
        <XbtModal
            props={props}
            title={name}
            subtitle={unread ? `${unread} unread` : "Nothing unread"}
            size="lg"
        >
            <div className="xbt-list">
                {recent.length
                    ? recent.map((message: any) => (
                        <Row
                            key={message.id}
                            title={message.author?.username ?? "someone"}
                            preview={message.content || (message.attachments?.length ? "(attachment)" : "(embed)")}
                            meta={new Date(message.timestamp).toLocaleString()}
                            actions={[{
                                label: "Jump",
                                onClick: () => { jumpToMessage(channelId, message.id); props.onClose(); }
                            }]}
                        />
                    ))
                    : <Empty>
                        Nothing loaded for this channel yet. Open it once and it will have something to show.
                    </Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "ChannelPeek",
    description: "Looks at what is in a channel without opening it, so nothing gets marked as read",
    tags: ["Utility", "Organisation", "Servers"],
    searchTerms: ["peek", "preview", "channel", "unread", "look", "without opening"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: { id: string; name?: string; }; }) => {
            if (!channel) return;

            const real = ChannelStore.getChannel(channel.id);
            if (real && real.type !== 0 && real.type !== 1 && real.type !== 3 && real.type !== 5) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-channel-peek"
                    label="Peek without opening"
                    action={() => openModal(props => (
                        <PeekModal {...props} channelId={channel.id} name={channel.name ? `#${channel.name}` : "This channel"} />
                    ))}
                />
            );
        }
    }
});
