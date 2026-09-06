/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { LogIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, Modal, openModal, Text, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";

const logger = new Logger("NicknameHistory");

interface History {
    username: string;
    names: { name: string; at: number; }[];
}

const history = new PersistedRecord<History>("Xbtcord_NicknameHistory");

const settings = definePluginSettings({
    maxPerUser: {
        type: OptionType.NUMBER,
        description: "How many old names to keep per person",
        default: 10
    }
});

/**
 * Records a name the moment it differs from the last one seen.
 *
 * Like LastSeen, this can only know what it watched: Discord publishes no history of what
 * someone used to be called, so a name changed before you installed this is simply gone.
 */
function record(user: User) {
    try {
        if (!user?.id || !user.username) return;

        const existing = history.get(user.id);
        const latest = existing?.names[0]?.name;
        if (latest === user.username) return;

        const names = [{ name: user.username, at: Date.now() }, ...(existing?.names ?? [])]
            .slice(0, Math.max(1, settings.store.maxPerUser));

        history.set(user.id, { username: user.username, names });
    } catch (err) {
        logger.error("Failed to record a name", err);
    }
}

function HistoryList({ userId }: { userId: string; }) {
    const all = history.use();
    const entry = all[userId];

    if (!entry || entry.names.length < 2) {
        return <div className="xbt-empty">No name changes seen for this person yet.</div>;
    }

    return (
        <div className="xbt-list">
            {entry.names.map((name, index) => (
                <div className="xbt-row" key={`${name.name}-${name.at}`}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">
                            {name.name} {index === 0 && <span className="xbt-tag">current</span>}
                        </Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">
                            {index === 0 ? "since" : "seen"} {new Date(name.at).toLocaleString()}
                        </Text>
                    </div>
                </div>
            ))}
        </div>
    );
}

function openHistory(user: User) {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title={`Names for ${user.username}`}
                subtitle="Only what this client has watched change"
                size="sm"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <HistoryList userId={user.id} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "NicknameHistory",
    description: "Remembers what people used to be called, from the moment you turn it on",
    tags: ["Utility", "Friends"],
    searchTerms: ["nickname", "name", "username", "history", "changed", "rename"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-name-history"
                    label="Name history"
                    icon={LogIcon}
                    action={() => openHistory(user)}
                />
            );
        }
    },

    flux: {
        // Every message carries its author, which is the cheapest place to notice a rename.
        MESSAGE_CREATE({ message }: { message: any; }) {
            if (message?.author?.id) record(UserStore.getUser(message.author.id) ?? message.author);
        },
        USER_UPDATE({ user }: { user: any; }) {
            if (user?.id) record(user);
        }
    },

    start: () => history.load()
});
