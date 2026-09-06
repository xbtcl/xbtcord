/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { FolderIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, GuildStore, Menu, Modal, openModal, showToast, Text, Toasts } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Bookmark {
    channelId: string;
    label: string;
    guild: string;
    addedAt: number;
}

const bookmarks = new PersistedRecord<Bookmark>("Xbtcord_ChannelBookmarks");

function add(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id)?.name ?? "" : "Direct messages";

    bookmarks.set(channelId, {
        channelId,
        label: describeChannel(channelId),
        guild,
        addedAt: Date.now()
    });
    showToast("Bookmarked", Toasts.Type.SUCCESS);
}

function BookmarkList({ close }: { close(): void; }) {
    const all = bookmarks.use();
    const rows = Object.values(all).sort((a, b) =>
        a.guild.localeCompare(b.guild) || a.label.localeCompare(b.label));

    if (!rows.length) {
        return <div className="xbt-empty">Nothing bookmarked. Right-click a channel and pick <b>Bookmark channel</b>.</div>;
    }

    return (
        <div className="xbt-list">
            {rows.map(bookmark => (
                <div className="xbt-row" key={bookmark.channelId}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{bookmark.label}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">{bookmark.guild}</Text>
                    </div>
                    <div className="xbt-row-actions">
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => { jumpToMessage(bookmark.channelId); close(); }}
                        >
                            Open
                        </Button>
                        <Button
                            size="small"
                            variant="dangerSecondary"
                            onClick={() => bookmarks.delete(bookmark.channelId)}
                        >
                            Remove
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function open() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Bookmarked channels"
                subtitle="The handful you actually use, across every server"
                size="sm"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <BookmarkList close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "ChannelBookmarks",
    description: "Pin the channels you actually use to one list, across every server",
    tags: ["Organisation", "Shortcuts", "Utility"],
    searchTerms: ["bookmark", "favourite", "favorite", "pin", "channel", "quick"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: any; }) => {
            if (!channel?.id) return;
            const marked = bookmarks.has(channel.id);

            children.push(
                <Menu.MenuItem
                    id="xbt-bookmark-channel"
                    label={marked ? "Remove bookmark" : "Bookmark channel"}
                    icon={FolderIcon}
                    action={() => marked ? bookmarks.delete(channel.id) : add(channel.id)}
                />
            );
        }
    },

    toolboxActions: {
        "Bookmarked channels": open
    },

    start: () => bookmarks.load()
});
