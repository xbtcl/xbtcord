/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { NotesIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, openModal, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Status {
    text: string;
    emoji?: string;
    seenAt: number;
}

const history = new PersistedRecord<Status[]>("Xbtcord_StatusHistory");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many past statuses to remember per person",
        default: 15
    },
    friendsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only remember statuses from your friends. Uses far less storage",
        default: true
    }
});

/** The custom status sits in the activities list with type 4 and no application. */
function customStatus(activities: any[] | undefined) {
    const activity = activities?.find(entry => entry?.type === 4);
    if (!activity) return null;

    const text = (activity.state ?? "").trim();
    const emoji = activity.emoji?.name as string | undefined;
    if (!text && !emoji) return null;

    return { text, emoji };
}

function record(userId: string, activities: any[] | undefined) {
    const current = customStatus(activities);
    if (!current) return;

    const previous = history.get(userId) ?? [];
    if (previous[0]?.text === current.text && previous[0]?.emoji === current.emoji) return;

    history.set(userId, [{ ...current, seenAt: Date.now() }, ...previous].slice(0, Math.max(1, settings.store.keep)));
}

function StatusHistoryModal({ userId, ...props }: { userId: string; } & any) {
    history.use();

    const entries = history.get(userId) ?? [];
    const user = UserStore.getUser(userId);

    return (
        <XbtModal
            props={props}
            title={`Status history${user ? ` - ${user.username}` : ""}`}
            subtitle="Only what this client has watched go by"
        >
            <div className="xbt-list">
                {entries.length
                    ? entries.map(entry => (
                        <Row
                            key={entry.seenAt}
                            title={`${entry.emoji ? `${entry.emoji} ` : ""}${entry.text || "(just an emoji)"}`}
                            meta={ago(entry.seenAt)}
                        />
                    ))
                    : <Empty>Nothing recorded yet. It fills up as people change their status while you are online.</Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "StatusHistory",
    description: "Keeps the custom statuses people had before this one. It only ever knows what it watched change",
    tags: ["Utility", "Friends"],
    searchTerms: ["status", "history", "custom status", "previous", "old"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        PRESENCE_UPDATES({ updates }: { updates: any[]; }) {
            const me = UserStore.getCurrentUser()?.id;

            for (const update of updates ?? []) {
                const userId = update?.user?.id ?? update?.userId;
                if (!userId || userId === me) continue;

                // Friend presence arrives without a guildId. That is the cheap way to
                // avoid recording every stranger in a large server.
                if (settings.store.friendsOnly && update.guildId && !history.has(userId)) continue;

                record(userId, update.activities);
            }
        }
    },

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id) return;

            const count = history.get(user.id)?.length ?? 0;
            if (!count) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-status-history"
                    label={`Status history (${count})`}
                    icon={NotesIcon}
                    action={() => openModal(props => <StatusHistoryModal {...props} userId={user.id} />)}
                />
            );
        }
    },

    start: () => history.load()
});
