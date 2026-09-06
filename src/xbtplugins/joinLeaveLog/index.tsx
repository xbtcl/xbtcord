/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, Modal, openModal, Text, useMemo, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";

const logger = new Logger("JoinLeaveLog");

interface Entry {
    id: string;
    kind: "join" | "leave";
    userId: string;
    username: string;
    guildId: string;
    guildName: string;
    at: number;
}

const log = new PersistedRecord<Entry>("Xbtcord_JoinLeaveLog");

const settings = definePluginSettings({
    guilds: {
        type: OptionType.STRING,
        description: "Only watch these server IDs, comma separated. Empty means every server you are in",
        default: ""
    },
    keepDays: {
        type: OptionType.NUMBER,
        description: "Forget entries after this many days",
        default: 30
    },
    maxEntries: {
        type: OptionType.NUMBER,
        description: "Hard cap on stored entries",
        default: 2000
    }
});

function watching(guildId: string): boolean {
    const list = settings.store.guilds.split(",").map(s => s.trim()).filter(Boolean);
    return !list.length || list.includes(guildId);
}

/**
 * Trims by age and by count.
 *
 * A busy server can produce thousands of joins a day, and this is IndexedDB on someone's
 * machine, not a database - the cap is what stops a single raid filling the disk.
 */
function prune() {
    const cutoff = Date.now() - Math.max(1, settings.store.keepDays) * 86_400_000;
    const entries = log.entries.map(([, entry]) => entry).sort((a, b) => b.at - a.at);

    const keep = new Set(
        entries
            .filter(entry => entry.at >= cutoff)
            .slice(0, Math.max(1, settings.store.maxEntries))
            .map(entry => entry.id)
    );

    for (const [id] of log.entries) {
        if (!keep.has(id)) log.delete(id);
    }
}

function record(kind: Entry["kind"], guildId: string, user: any) {
    try {
        if (!guildId || !user?.id || !watching(guildId)) return;

        const id = makeId();
        log.set(id, {
            id,
            kind,
            userId: user.id,
            username: user.username ?? "Unknown",
            guildId,
            guildName: GuildStore.getGuild(guildId)?.name ?? "A server",
            at: Date.now()
        });
    } catch (err) {
        logger.error("Couldn't record an event", err);
    }
}

function LogList() {
    const all = log.use();
    const [filter, setFilter] = useState<"all" | "join" | "leave">("all");

    const rows = useMemo(
        () => Object.values(all)
            .filter(entry => filter === "all" || entry.kind === filter)
            .sort((a, b) => b.at - a.at)
            .slice(0, 300),
        [all, filter]
    );

    return (
        <>
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <div />
                    {(["all", "join", "leave"] as const).map(kind => (
                        <button
                            key={kind}
                            className={`xbt-tag${filter === kind ? " xbt-tag-active" : ""}`}
                            onClick={() => setFilter(kind)}
                        >
                            {kind === "all" ? "Everything" : kind === "join" ? "Joined" : "Left"}
                        </button>
                    ))}
                </div>
            </div>

            {!rows.length
                ? <div className="xbt-empty">Nothing logged yet.</div>
                : (
                    <div className="xbt-list">
                        {rows.map(entry => (
                            <div className="xbt-row" key={entry.id}>
                                <div className="xbt-row-body">
                                    <Text variant="text-sm/semibold">
                                        {entry.username} <span className="xbt-tag">{entry.kind === "join" ? "joined" : "left"}</span>
                                    </Text>
                                    <Text variant="text-xs/normal" className="xbt-row-meta">
                                        {entry.guildName} · {new Date(entry.at).toLocaleString()}
                                    </Text>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
        </>
    );
}

function open() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Joins and leaves"
                subtitle="Only what this client was open to see"
                size="md"
                actions={[
                    { text: "Clear", variant: "secondary", onClick: () => log.clear() },
                    { text: "Close", variant: "primary", onClick: props.onClose }
                ]}
            >
                <LogList />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "JoinLeaveLog",
    description: "Keeps a local log of who joined and left your servers while you were online",
    tags: ["Servers", "Utility"],
    searchTerms: ["join", "leave", "member", "log", "history", "raid"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        GUILD_MEMBER_ADD(event: any) {
            record("join", event?.guildId ?? event?.guild_id, event?.user);
        },
        GUILD_MEMBER_REMOVE(event: any) {
            record("leave", event?.guildId ?? event?.guild_id, event?.user);
        }
    },

    toolboxActions: {
        "Joins and leaves": open
    },

    async start() {
        await log.load();
        prune();
    }
});
