/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { InfoIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, Tooltip } from "@webpack/common";
import { User } from "@xbtcord/discord-types";

/** Discord's snowflake epoch: the first millisecond of 2015. */
const DISCORD_EPOCH = 1_420_070_400_000n;

const settings = definePluginSettings({
    warnUnder: {
        type: OptionType.NUMBER,
        description: "Flag accounts younger than this many days on their messages (0 turns the flag off)",
        default: 7
    },
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Also flag new accounts in the member list",
        default: false
    }
});

export function createdAt(userId: string): Date | null {
    try {
        // The timestamp is the top 42 bits of the id, so this has to be done in BigInt -
        // a Discord id is well past what a double can hold exactly.
        return new Date(Number((BigInt(userId) >> 22n) + DISCORD_EPOCH));
    } catch {
        return null;
    }
}

function ageInDays(userId: string): number | null {
    const created = createdAt(userId);
    if (!created) return null;
    return (Date.now() - created.getTime()) / 86_400_000;
}

function describeAge(days: number): string {
    if (days < 1) return "less than a day old";
    if (days < 60) return `${Math.floor(days)} days old`;
    if (days < 730) return `${Math.floor(days / 30.44)} months old`;
    return `${(days / 365.25).toFixed(1)} years old`;
}

function NewAccountFlag({ userId }: { userId: string; }) {
    const threshold = settings.store.warnUnder;
    if (!threshold || threshold <= 0) return null;

    const days = ageInDays(userId);
    if (days == null || days >= threshold) return null;

    const created = createdAt(userId)!;

    return (
        <Tooltip text={`Account created ${created.toLocaleDateString()} - ${describeAge(days)}`}>
            {tooltipProps => (
                <span {...tooltipProps} className="xbt-new-account">NEW</span>
            )}
        </Tooltip>
    );
}

export default definePlugin({
    name: "AccountAge",
    description: "Shows when an account was made, and flags brand new ones on their messages",
    tags: ["Utility", "Privacy", "Servers"],
    searchTerms: ["account", "age", "created", "new", "alt", "raid", "snowflake"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id) return;

            const created = createdAt(user.id);
            if (!created) return;

            const days = ageInDays(user.id)!;

            children.push(
                <Menu.MenuItem
                    id="xbt-account-age"
                    label={`Created ${created.toLocaleDateString()} (${describeAge(days)})`}
                    icon={InfoIcon}
                    action={() => copyWithToast(created.toISOString(), "Creation date copied")}
                />
            );
        }
    },

    renderMessageDecoration: ({ message }) => {
        if (!message?.author?.id) return null;
        return <NewAccountFlag userId={message.author.id} />;
    },

    renderMemberListDecorator: ({ user }) => {
        if (!settings.store.showInMemberList || !user?.id) return null;
        return <NewAccountFlag userId={user.id} />;
    }
});
