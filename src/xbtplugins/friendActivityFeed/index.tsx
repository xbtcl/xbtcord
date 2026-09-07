/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, RelationshipStore, UserStore } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Event {
    userId: string;
    name: string;
    kind: "status" | "game" | "stopped";
    detail: string;
    at: number;
}

const feed = new PersistedRecord<Event>("Xbtcord_FriendActivityFeed");

const settings = definePluginSettings({
    keep: {
        type: OptionType.NUMBER,
        description: "How many events to keep",
        default: 150
    },
    trackStatus: {
        type: OptionType.BOOLEAN,
        description: "Record when friends come online and go offline",
        default: true
    },
    trackGames: {
        type: OptionType.BOOLEAN,
        description: "Record what friends start and stop playing",
        default: true
    }
});

/*
 * Friends only, and only what presence already broadcasts to you. This is the same
 * information the friends list shows in real time; the difference is that it is still
 * here when you get back, rather than gone the moment they close the game.
 */
const lastStatus = new Map<string, string>();
const lastGame = new Map<string, string>();

function push(event: Event) {
    feed.set(makeId(), event);

    const limit = Math.max(20, settings.store.keep);
    const sorted = feed.entries.sort((a, b) => b[1].at - a[1].at);
    for (const [id] of sorted.slice(limit)) feed.delete(id);
}

function handle(userId: string, status: string, activities: any[] | undefined) {
    if (!RelationshipStore.isFriend(userId)) return;

    const name = UserStore.getUser(userId)?.username ?? "someone";

    if (settings.store.trackStatus) {
        const previous = lastStatus.get(userId);
        if (previous && previous !== status) {
            push({ userId, name, kind: "status", detail: status, at: Date.now() });
        }
        lastStatus.set(userId, status);
    }

    if (settings.store.trackGames) {
        // Type 0 is "Playing", which is the only one worth a feed entry - type 2 would
        // fill the whole list with every Spotify track anyone listens to.
        const game = activities?.find(activity => activity?.type === 0)?.name ?? "";
        const previous = lastGame.get(userId) ?? "";

        if (game !== previous) {
            if (game) push({ userId, name, kind: "game", detail: game, at: Date.now() });
            else if (previous) push({ userId, name, kind: "stopped", detail: previous, at: Date.now() });
            lastGame.set(userId, game);
        }
    }
}

function describe(event: Event) {
    if (event.kind === "game") return `${event.name} started playing ${event.detail}`;
    if (event.kind === "stopped") return `${event.name} stopped playing ${event.detail}`;
    return event.detail === "offline" ? `${event.name} went offline` : `${event.name} is ${event.detail}`;
}

function FeedModal(props: any) {
    feed.use();

    const entries = feed.entries.sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Friend activity" subtitle="What your friends have been up to while you were away" size="lg">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, event]) => (
                        <Row key={id} title={describe(event)} meta={ago(event.at)} />
                    ))
                    : <Empty>Nothing yet. It fills up as friends come and go.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => feed.clear()}>Clear</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "FriendActivityFeed",
    description: "A running log of when friends came online and what they played, so you can see what you missed",
    tags: ["Friends", "Activity", "Utility"],
    searchTerms: ["friends", "activity", "feed", "presence", "games", "online", "log"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        PRESENCE_UPDATES({ updates }: { updates: any[]; }) {
            const me = UserStore.getCurrentUser()?.id;

            for (const update of updates ?? []) {
                const userId = update?.user?.id ?? update?.userId;
                if (!userId || userId === me) continue;
                handle(userId, update.status, update.activities);
            }
        }
    },

    toolboxActions: {
        "Friend activity": () => openModal(props => <FeedModal {...props} />)
    },

    async start() {
        await feed.load();
        lastStatus.clear();
        lastGame.clear();
    },

    stop() {
        lastStatus.clear();
        lastGame.clear();
    }
});
