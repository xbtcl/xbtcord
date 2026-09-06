/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { addProfileSlot, removeProfileSlot } from "@utils/profileSlot";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, PresenceStore, Tooltip, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { formatDuration } from "@xbtplugins/_shared/util";

const logger = new Logger("LastSeen");

interface Seen {
    /** When we last watched them go offline. */
    offlineAt?: number;
    /** When we last saw them online at all, offline transition or not. */
    onlineAt?: number;
}

const seen = new PersistedRecord<Seen>("Xbtcord_LastSeen");

const settings = definePluginSettings({
    showInProfile: {
        type: OptionType.BOOLEAN,
        description: "Show it on profiles, under Member Since",
        default: true
    },
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Also mark people in the member list who have been away a while",
        default: false
    },
    trackEveryone: {
        type: OptionType.BOOLEAN,
        description: "Track everyone Discord tells us about, not just friends. Uses more storage",
        default: false
    }
});

/**
 * Discord does not tell anyone when a user was last online.
 *
 * There is no field for it in the API and no endpoint that returns one - presence is
 * strictly "what are they doing right now". So this is built the only way it can be: by
 * watching presence go by and writing down when someone drops offline. It knows nothing
 * about the time before you turned it on, or about periods your client was closed, and the
 * UI says so rather than implying a gap was time spent away.
 */
function record(userId: string, status: string) {
    const existing = seen.get(userId) ?? {};

    if (status === "offline") {
        // Only the first offline sighting after being online is the moment they left;
        // repeated offline updates would otherwise keep bumping it forward.
        if (existing.offlineAt && !existing.onlineAt) return;
        seen.set(userId, { offlineAt: Date.now(), onlineAt: undefined });
    } else {
        seen.set(userId, { offlineAt: undefined, onlineAt: Date.now() });
    }
}

export function describe(userId: string): string {
    const entry = seen.get(userId);
    const status = PresenceStore.getStatus(userId);

    if (status && status !== "offline") return "Online now";
    if (entry?.offlineAt) return `Last seen ${formatDuration(Date.now() - entry.offlineAt)} ago`;
    if (entry?.onlineAt) return `Last seen ${formatDuration(Date.now() - entry.onlineAt)} ago`;

    return "Not seen online yet";
}

/**
 * The row itself. Mounting is handled by the shared profile slot, which is also what
 * FakeConnections uses - one MutationObserver and one fiber read between them, rather
 * than each plugin growing its own.
 */
function LastSeenRow({ userId }: { userId: string; }) {
    seen.use();

    if (!settings.store.showInProfile) return null;

    return (
        <div className="xbt-last-seen-host">
            <div className="xbt-last-seen-label">LAST SEEN</div>
            <div className="xbt-last-seen-value">{describe(userId)}</div>
        </div>
    );
}

function AwayMark({ userId }: { userId: string; }) {
    seen.use();

    const entry = seen.get(userId);
    const status = PresenceStore.getStatus(userId);
    if (!entry?.offlineAt || (status && status !== "offline")) return null;

    const days = (Date.now() - entry.offlineAt) / 86_400_000;
    if (days < 1) return null;

    return (
        <Tooltip text={describe(userId)}>
            {tooltipProps => <span {...tooltipProps} className="xbt-last-seen-dot" />}
        </Tooltip>
    );
}

export default definePlugin({
    name: "LastSeen",
    description: "Remembers when people were last online and shows it under Member Since. Only knows what it has watched",
    tags: ["Utility", "Friends"],
    searchTerms: ["last", "seen", "online", "offline", "presence", "away", "activity"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        PRESENCE_UPDATES({ updates }: { updates: any[]; }) {
            try {
                const me = UserStore.getCurrentUser()?.id;

                for (const update of updates ?? []) {
                    const userId = update?.user?.id ?? update?.userId;
                    if (!userId || userId === me) continue;

                    /*
                     * Everyone in a large server generates presence traffic, and storing all
                     * of it would fill the database with people you never look at. Friend
                     * presence arrives with no guildId, which is the cheap way to tell it
                     * apart from "someone in a server you happen to share".
                     */
                    if (!settings.store.trackEveryone && update.guildId && !seen.has(userId)) continue;

                    record(userId, update.status);
                }
            } catch (err) {
                logger.error("Failed to record presence", err);
            }
        }
    },

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-last-seen"
                    label={describe(user.id)}
                    icon={ClockIcon}
                    action={() => { }}
                />
            );
        }
    },

    renderMemberListDecorator: ({ user }) => {
        if (!settings.store.showInMemberList || !user?.id) return null;
        return <AwayMark userId={user.id} />;
    },

    async start() {
        await seen.load();
        addProfileSlot("LastSeen", userId => <LastSeenRow userId={userId} />);
    },

    stop() {
        removeProfileSlot("LastSeen");
    }
});
