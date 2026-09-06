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

// -----------------------------------------------------------------------------------------
// Getting it under Member Since
// -----------------------------------------------------------------------------------------
//
// This is done by watching the DOM rather than by patching Discord, and that is a deliberate
// choice rather than laziness.
//
// The injection point every Vencord-family plugin used for the profile popout - a module
// containing `"UserProfilePopout");` - does not exist in current Discord at all. A patch
// aimed at it sits in the pending list forever and silently does nothing, which is exactly
// how this plugin looked broken. The component that actually renders "Member Since" is
// minified with no stable anchor: its variable names, its CSS class hashes and its JSX
// shape all change between builds, so any regex written against it today is a guess with a
// short shelf life.
//
// Watching for the element and appending a sibling cannot crash the client, cannot break
// the profile, and fails in the only acceptable way when Discord renames something: the
// line quietly stops appearing. The user id is read from React's own props via the fiber,
// so it is never guessed from the DOM.

const MARKER = "xbt-last-seen-host";

function fiberProps(node: Element): any | null {
    const key = Object.keys(node).find(k => k.startsWith("__reactFiber$"));
    if (!key) return null;

    let fiber = (node as any)[key];
    for (let depth = 0; depth < 12 && fiber; depth++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (props && typeof props.userId === "string") return props;
    }
    return null;
}

function decorate() {
    if (!settings.store.showInProfile) return;

    for (const wrapper of document.querySelectorAll<HTMLElement>('[class*="memberSince"]')) {
        // Only the outer wrapper, and only once per render.
        if (wrapper.dataset.xbtLastSeen === "1") continue;
        if (wrapper.parentElement?.querySelector(`.${MARKER}`)) continue;

        const props = fiberProps(wrapper);
        if (!props?.userId) continue;

        wrapper.dataset.xbtLastSeen = "1";

        const host = document.createElement("div");
        host.className = MARKER;
        host.innerHTML = "<div class=\"xbt-last-seen-label\">LAST SEEN</div><div class=\"xbt-last-seen-value\"></div>";
        host.querySelector(".xbt-last-seen-value")!.textContent = describe(props.userId);

        wrapper.insertAdjacentElement("afterend", host);
    }
}

let observer: MutationObserver | undefined;
let scheduled = false;

/** Coalesced to one pass per frame - Discord mutates the DOM constantly. */
function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        try { decorate(); } catch (err) { logger.error("Couldn't decorate a profile", err); }
    });
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

                schedule();
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

        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
        schedule();
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        for (const host of document.querySelectorAll(`.${MARKER}`)) host.remove();
        for (const marked of document.querySelectorAll<HTMLElement>("[data-xbt-last-seen]")) {
            delete marked.dataset.xbtLastSeen;
        }
    }
});
