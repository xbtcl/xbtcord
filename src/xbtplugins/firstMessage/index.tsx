/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DownArrow } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, NavigationRouter } from "@webpack/common";

/*
 * Jumping to message id 0 asks Discord for the messages after the beginning of time,
 * which is the oldest page in the channel. It is the same route the "jump to first
 * unread" banner uses, just with a floor instead of a bookmark, so there is no fetching
 * or paging to do here - the client already knows how to land there.
 */
function jumpToStart(channelId: string) {
    const guildId = ChannelStore.getChannel(channelId)?.guild_id ?? "@me";
    NavigationRouter.transitionTo(`/channels/${guildId}/${channelId}/0`);
}

export default definePlugin({
    name: "FirstMessage",
    description: "Jumps to the very first message in a channel or a DM, however old it is",
    tags: ["Utility", "Shortcuts"],
    searchTerms: ["first", "oldest", "beginning", "start", "top", "history"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: { id: string; }; }) => {
            if (!channel) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-first-message"
                    label="Go to the first message"
                    icon={DownArrow}
                    action={() => jumpToStart(channel.id)}
                />
            );
        },
        "user-context": (children, { channel }: { channel?: { id: string; }; }) => {
            if (!channel) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-first-message-dm"
                    label="Go to the start of this DM"
                    icon={DownArrow}
                    action={() => jumpToStart(channel.id)}
                />
            );
        }
    },

    toolboxActions: {
        "Go to the first message": () => {
            const channel = getCurrentChannel();
            if (channel) jumpToStart(channel.id);
        }
    }
});
