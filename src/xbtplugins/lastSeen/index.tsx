/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { PresenceStore, Text, UserStore } from "@webpack/common";
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
        description: "Show it on profiles, under the rest of the details",
        default: true
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
 * watching presence go by and writing down when someone drops offline. That means it knows
 * nothing about the time before you turned it on, and nothing about periods your client was
 * closed, and the UI says so rather than implying a gap was time spent offline.
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

function describe(userId: string): string | null {
    const entry = seen.get(userId);
    const status = PresenceStore.getStatus(userId);

    if (status && status !== "offline") return "Online now";
    if (!entry) return null;

    if (entry.offlineAt) return `Last seen ${formatDuration(Date.now() - entry.offlineAt)} ago`;
    if (entry.onlineAt) return `Last seen ${formatDuration(Date.now() - entry.onlineAt)} ago`;

    return null;
}

function LastSeenRow({ userId }: { userId: string; }) {
    seen.use();

    if (!settings.store.showInProfile) return null;

    const text = describe(userId);
    if (!text) return null;

    return (
        <div className="xbt-last-seen">
            <Text variant="text-xs/semibold" className="xbt-last-seen-label">LAST SEEN</Text>
            <Text variant="text-sm/normal">{text}</Text>
        </div>
    );
}

export default definePlugin({
    name: "LastSeen",
    description: "Remembers when people were last online and shows it on their profile. Only knows what it has watched",
    tags: ["Utility", "Friends"],
    searchTerms: ["last", "seen", "online", "offline", "presence", "activity"],
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
                     * Everyone in a large server generates presence traffic, and storing
                     * all of it would fill the database with people you never look at.
                     * Friend presence arrives with no guildId, which is the cheap way to
                     * tell it apart from "someone in a server you happen to share", so by
                     * default only friends and people already tracked are kept.
                     */
                    if (!settings.store.trackEveryone && update.guildId && !seen.has(userId)) continue;

                    record(userId, update.status);
                }
            } catch (err) {
                logger.error("Failed to record presence", err);
            }
        }
    },

    patches: [
        {
            // The same anchor ShowConnections uses. Both append, so they compose.
            find: '"UserProfilePopout");',
            replacement: {
                match: /userId:\i\.id,guild:\i\}\)(?=])/,
                replace: "$&,$self.profileRow(arguments[0])"
            }
        }
    ],

    profileRow: (props: any) => {
        const userId = props?.user?.id ?? props?.userId;
        if (!userId) return null;

        return (
            <ErrorBoundary noop>
                <LastSeenRow userId={userId} />
            </ErrorBoundary>
        );
    },

    start: () => seen.load()
});
