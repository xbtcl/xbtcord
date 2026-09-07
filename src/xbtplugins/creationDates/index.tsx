/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, SnowflakeUtils } from "@webpack/common";
import { formatDuration } from "@xbtplugins/_shared/util";

const settings = definePluginSettings({
    relative: {
        type: OptionType.BOOLEAN,
        description: "Also show how long ago it was",
        default: true
    }
});

/**
 * AccountAge already answers this for people. Everything else on Discord carries the same
 * timestamp in its id and nothing surfaces it: channels, servers, roles, messages and
 * emoji all know exactly when they were made.
 */
function describe(id: string) {
    const created = SnowflakeUtils.extractTimestamp(id);
    const stamp = new Date(created).toLocaleString();
    return settings.store.relative ? `${stamp} (${formatDuration(Date.now() - created)} ago)` : stamp;
}

function item(id: string, label: string, snowflake?: string) {
    if (!snowflake) return null;

    const text = describe(snowflake);
    return (
        <Menu.MenuItem
            id={id}
            label={`${label}: ${text}`}
            icon={ClockIcon}
            action={() => copyWithToast(text, "Copied")}
        />
    );
}

export default definePlugin({
    name: "CreationDates",
    description: "Shows when a server, channel, role, message or emoji was made, straight from its id",
    tags: ["Utility", "Servers"],
    searchTerms: ["created", "date", "age", "snowflake", "when", "made"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "guild-context": (children, { guild }: { guild?: { id: string; }; }) => {
            const entry = item("xbt-created-guild", "Server created", guild?.id);
            if (entry) children.push(entry);
        },
        "channel-context": (children, { channel }: { channel?: { id: string; }; }) => {
            const entry = item("xbt-created-channel", "Channel created", channel?.id);
            if (entry) children.push(entry);
        },
        "dev-context": (children, { id }: { id?: string; }) => {
            // The developer-mode "copy id" menu turns up on roles and emoji too, which is
            // the only place either of those is reachable from a context menu at all.
            const entry = item("xbt-created-generic", "Created", id);
            if (entry) children.push(entry);
        },
        message: (children, { message }: { message?: { id: string; }; }) => {
            const entry = item("xbt-created-message", "Sent", message?.id);
            if (entry) children.push(entry);
        }
    }
});
