/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { addProfileSlot, removeProfileSlot } from "@utils/profileSlot";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, openMediaModal, Tooltip, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago } from "@xbtplugins/_shared/ui";

interface Entry {
    /** The avatar hash, or null for one of the default avatars. */
    hash: string | null;
    seenAt: number;
}

const history = new PersistedRecord<Entry[]>("Xbtcord_AvatarHistory");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many past avatars to remember per person",
        default: 8
    },
    showInProfile: {
        type: OptionType.BOOLEAN,
        description: "Show them on the profile, under Member Since",
        default: true
    }
});

function urlFor(userId: string, hash: string | null, size = 128) {
    if (!hash) return `https://cdn.discordapp.com/embed/avatars/${(BigInt(userId) >> 22n) % 6n}.png`;
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size}`;
}

/**
 * Discord keeps no avatar history, and there is no endpoint that would give us one - so
 * like LastSeen, this can only know what it has watched. It starts recording the first
 * time it sees someone, and says so rather than implying the oldest entry it has is the
 * oldest one that ever existed.
 */
function record(user: User) {
    const previous = history.get(user.id) ?? [];
    const hash = user.avatar ?? null;

    if (previous[0]?.hash === hash) return;

    history.set(user.id, [{ hash, seenAt: Date.now() }, ...previous].slice(0, Math.max(1, settings.store.keep)));
}

function AvatarHistoryRow({ userId }: { userId: string; }) {
    history.use();

    const entries = history.get(userId);
    if (!settings.store.showInProfile || !entries || entries.length < 2) return null;

    return (
        <div className="xbt-avatar-history">
            <div className="xbt-avatar-history-label">AVATAR HISTORY</div>
            <div className="xbt-avatar-history-strip">
                {entries.map(entry => (
                    <Tooltip key={`${entry.hash}-${entry.seenAt}`} text={ago(entry.seenAt)}>
                        {tooltipProps => (
                            <img
                                {...tooltipProps}
                                className="xbt-avatar-history-item"
                                src={urlFor(userId, entry.hash, 128)}
                                alt=""
                                onClick={() => openMediaModal({ items: [{ url: urlFor(userId, entry.hash, 1024), type: "IMAGE" }] } as any)}
                            />
                        )}
                    </Tooltip>
                ))}
            </div>
        </div>
    );
}

export default definePlugin({
    name: "AvatarHistory",
    description: "Remembers the avatars people had before this one, from the moment you turn it on",
    tags: ["Utility", "Friends"],
    searchTerms: ["avatar", "history", "pfp", "previous", "old", "profile picture"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        USER_UPDATE({ user }: { user?: User; }) {
            if (user?.id) record(user);
        }
    },

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            const entries = user && history.get(user.id);
            if (!user || !entries || entries.length < 2) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-avatar-history"
                    label={`${entries.length - 1} older avatar${entries.length === 2 ? "" : "s"} on file`}
                    icon={ImageIcon}
                    action={() => openMediaModal({
                        items: entries.map(entry => ({ url: urlFor(user.id, entry.hash, 1024), type: "IMAGE" }))
                    } as any)}
                />
            );
        }
    },

    async start() {
        await history.load();

        // Everyone already in the store counts as a first sighting, so the history has
        // something to compare against the next time one of them changes.
        for (const user of Object.values(UserStore.getUsers() ?? {})) record(user as User);

        addProfileSlot("AvatarHistory", userId => <AvatarHistoryRow userId={userId} />);
    },

    stop() {
        removeProfileSlot("AvatarHistory");
    }
});
