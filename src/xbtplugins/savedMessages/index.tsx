/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { ChannelStore, Menu, showToast, Toasts } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

import { collections, isSaved, openSavedModal, save, saved, unsave } from "./saved";

const BookmarkIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" width={width} height={height} className={className} fill="currentColor" aria-hidden="true">
        <path d="M6 2h12a2 2 0 0 1 2 2v18l-8-4.5L4 22V4a2 2 0 0 1 2-2Z" />
    </svg>
);

const BookmarkOutlineIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" width={width} height={height} className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </svg>
);

const settings = definePluginSettings({
    defaultCollection: {
        type: OptionType.STRING,
        description: "Collection a message goes into when you use the bookmark button",
        default: "Saved"
    },
    showPopoverButton: {
        type: OptionType.BOOLEAN,
        description: "Show a bookmark button on message hover",
        default: true
    }
});

function SaveMenu({ message }: { message: Message; }) {
    if (isSaved(message)) {
        return (
            <Menu.MenuItem
                id="xbt-unsave-message"
                label="Remove from saved"
                icon={BookmarkIcon}
                action={() => {
                    unsave(message);
                    showToast("Removed from saved", Toasts.Type.SUCCESS);
                }}
            />
        );
    }

    return (
        <Menu.MenuItem id="xbt-save-message" label="Save message" icon={BookmarkOutlineIcon}>
            {collections().map(name => (
                <Menu.MenuItem
                    key={name}
                    id={`xbt-save-to-${name}`}
                    label={name}
                    action={() => {
                        save(message, name);
                        showToast(`Saved to ${name}`, Toasts.Type.SUCCESS);
                    }}
                />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="xbt-save-browse"
                label="Browse saved messages"
                action={openSavedModal}
            />
        </Menu.MenuItem>
    );
}

export default definePlugin({
    name: "SavedMessages",
    description: "Bookmark messages into your own collections and search them later, all stored locally",
    tags: ["Chat", "Organisation", "Utility"],
    searchTerms: ["bookmark", "save", "star", "pin", "later"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        message: (children, { message }: { message: Message; }) => {
            if (!message) return;
            children.push(<SaveMenu message={message} />);
        }
    },

    messagePopoverButton: {
        icon: BookmarkOutlineIcon,
        render(message) {
            if (!settings.store.showPopoverButton) return null;

            const alreadySaved = isSaved(message);

            return {
                label: alreadySaved ? "Remove from saved" : "Save message",
                icon: alreadySaved ? BookmarkIcon : BookmarkOutlineIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => {
                    if (alreadySaved) unsave(message);
                    else save(message, settings.store.defaultCollection || "Saved");
                },
                onContextMenu: e => {
                    e.preventDefault();
                    openSavedModal();
                }
            };
        }
    },

    toolboxActions: {
        "Saved messages": openSavedModal
    },

    start: () => saved.load()
});
