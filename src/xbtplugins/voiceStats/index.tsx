/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { ChannelStore, GuildStore, Modal, openModal, Text, UserStore } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { formatDuration } from "@xbtplugins/_shared/util";

const logger = new Logger("VoiceStats");

interface Total {
    label: string;
    ms: number;
}

/** Totals per guild (plus one bucket for DM calls), accumulated across restarts. */
const totals = new PersistedRecord<Total>("Xbtcord_VoiceStats");

let joinedAt: number | null = null;
let joinedKey: string | null = null;

function keyFor(channelId: string): { key: string; label: string; } {
    const channel = ChannelStore.getChannel(channelId);
    const guildId = channel?.guild_id;

    if (!guildId) return { key: "dm", label: "Calls and group DMs" };
    return { key: guildId, label: GuildStore.getGuild(guildId)?.name ?? "A server" };
}

function bank() {
    if (joinedAt == null || joinedKey == null) return;

    const elapsed = Date.now() - joinedAt;
    joinedAt = null;

    // Under a second is a misclick or a reconnect, not a call.
    if (elapsed < 1000) { joinedKey = null; return; }

    const existing = totals.get(joinedKey);
    totals.set(joinedKey, {
        label: existing?.label ?? joinedKey,
        ms: (existing?.ms ?? 0) + elapsed
    });
    joinedKey = null;
}

function StatsList() {
    const all = totals.use();
    const rows = Object.entries(all)
        .map(([key, total]) => ({ key, ...total }))
        .sort((a, b) => b.ms - a.ms);

    if (!rows.length) {
        return <div className="xbt-empty">Nothing counted yet. Join a voice channel.</div>;
    }

    const grand = rows.reduce((sum, row) => sum + row.ms, 0);

    return (
        <>
            <div className="xbt-form">
                <Text variant="text-sm/semibold">{formatDuration(grand)} in voice altogether</Text>
            </div>
            <div className="xbt-list">
                {rows.map(row => (
                    <div className="xbt-row" key={row.key}>
                        <div className="xbt-row-body">
                            <Text variant="text-sm/semibold">{row.label}</Text>
                        </div>
                        <Text variant="text-sm/normal">{formatDuration(row.ms)}</Text>
                    </div>
                ))}
            </div>
        </>
    );
}

function openStats() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Time in voice"
                subtitle="Counted on this machine, only while Discord was open"
                size="sm"
                actions={[
                    { text: "Reset", variant: "secondary", onClick: () => totals.clear() },
                    { text: "Close", variant: "primary", onClick: props.onClose }
                ]}
            >
                <StatsList />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "VoiceStats",
    description: "Counts how long you actually spend in voice, per server",
    tags: ["Voice", "Utility"],
    searchTerms: ["voice", "stats", "time", "call", "hours", "tracker"],
    authors: [Devs.Xbtcord],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            try {
                const me = UserStore.getCurrentUser()?.id;
                if (!me) return;

                for (const state of voiceStates ?? []) {
                    if ((state.userId ?? state.user_id) !== me) continue;

                    const channelId = state.channelId ?? state.channel_id ?? null;

                    if (!channelId) { bank(); continue; }

                    const { key, label } = keyFor(channelId);

                    // Moving between channels in the same guild is one continuous session.
                    if (joinedKey === key) continue;

                    bank();
                    joinedKey = key;
                    joinedAt = Date.now();

                    const existing = totals.get(key);
                    if (!existing || existing.label !== label) {
                        totals.set(key, { label, ms: existing?.ms ?? 0 });
                    }
                }
            } catch (err) {
                logger.error("Failed to handle a voice update", err);
            }
        }
    },

    toolboxActions: {
        "Time in voice": openStats
    },

    start: () => totals.load(),

    stop() {
        // Bank whatever is open, so toggling the plugin off doesn't lose the session.
        bank();
    }
});
