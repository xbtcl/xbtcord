/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { LogIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { addProfileSlot, removeProfileSlot } from "@utils/profileSlot";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, openModal, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Name {
    username: string;
    globalName?: string;
    seenAt: number;
}

const history = new PersistedRecord<Name[]>("Xbtcord_UsernameTracker");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many past names to remember per person",
        default: 10
    },
    showInProfile: {
        type: OptionType.BOOLEAN,
        description: "Note on the profile when someone has changed their name",
        default: true
    }
});

/*
 * NicknameHistory covers per-server nicknames. This is the account itself - the username
 * and the display name - which changes far less often and matters far more, because it is
 * the one people use to work out whether the person messaging them is who they say.
 */
function record(user: User) {
    const previous = history.get(user.id) ?? [];
    const globalName = (user as any).globalName ?? undefined;

    if (previous[0]?.username === user.username && previous[0]?.globalName === globalName) return;

    history.set(user.id, [{ username: user.username, globalName, seenAt: Date.now() }, ...previous]
        .slice(0, Math.max(1, settings.store.keep)));
}

function label(entry: Name) {
    return entry.globalName && entry.globalName !== entry.username
        ? `${entry.globalName} (@${entry.username})`
        : `@${entry.username}`;
}

function HistoryModal({ userId, ...props }: { userId: string; } & any) {
    history.use();

    const entries = history.get(userId) ?? [];

    return (
        <XbtModal props={props} title="Name history" subtitle="Recorded from the moment you first saw this account">
            <div className="xbt-list">
                {entries.length
                    ? entries.map((entry, index) => (
                        <Row
                            key={entry.seenAt}
                            title={label(entry)}
                            meta={index === 0 ? "Now" : `Until ${ago(entries[index - 1].seenAt)}`}
                        />
                    ))
                    : <Empty>Nothing recorded yet.</Empty>
                }
            </div>
        </XbtModal>
    );
}

function ProfileNote({ userId }: { userId: string; }) {
    history.use();

    const entries = history.get(userId) ?? [];
    if (!settings.store.showInProfile || entries.length < 2) return null;

    return (
        <div className="xbt-row-meta" style={{ marginTop: 8 }}>
            Changed name {entries.length - 1} time{entries.length === 2 ? "" : "s"} since you met -
            was {label(entries[1])}
        </div>
    );
}

export default definePlugin({
    name: "UsernameTracker",
    description: "Notices when someone changes their username or display name, and keeps the old ones",
    tags: ["Utility", "Friends", "Privacy"],
    searchTerms: ["username", "name", "history", "changed", "display name", "rename"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        USER_UPDATE({ user }: { user?: User; }) {
            if (user?.id) record(user);
        }
    },

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id) return;

            const count = history.get(user.id)?.length ?? 0;
            if (count < 2) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-username-history"
                    label={`Name history (${count - 1} change${count === 2 ? "" : "s"})`}
                    icon={LogIcon}
                    action={() => openModal(props => <HistoryModal {...props} userId={user.id} />)}
                />
            );
        }
    },

    async start() {
        await history.load();
        for (const user of Object.values(UserStore.getUsers() ?? {})) record(user as User);
        addProfileSlot("UsernameTracker", userId => <ProfileNote userId={userId} />);
    },

    stop() {
        removeProfileSlot("UsernameTracker");
    }
});
