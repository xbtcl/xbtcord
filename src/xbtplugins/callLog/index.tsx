/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { openModal, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel, formatDuration } from "@xbtplugins/_shared/util";

interface Entry {
    where: string;
    joinedAt: number;
    leftAt: number;
    /** Everyone who was in the call at any point while you were. */
    withWhom: string[];
}

const log = new PersistedRecord<Entry>("Xbtcord_CallLog");

/** The call currently in progress, if any. Not persisted until it ends. */
let current: { channelId: string; where: string; joinedAt: number; withWhom: Set<string>; } | null = null;

function begin(channelId: string) {
    current = {
        channelId,
        where: describeChannel(channelId),
        joinedAt: Date.now(),
        withWhom: new Set()
    };
    note();
}

function end() {
    if (!current) return;

    const duration = Date.now() - current.joinedAt;

    // Anything under five seconds is a misclick, and logging those makes the list
    // useless within a week.
    if (duration >= 5000) {
        log.set(makeId(), {
            where: current.where,
            joinedAt: current.joinedAt,
            leftAt: Date.now(),
            withWhom: [...current.withWhom]
        });
    }

    current = null;
}

/** Records who else is in the call right now, adding to whoever has already been seen. */
function note() {
    if (!current) return;

    const me = UserStore.getCurrentUser()?.id;
    const states = VoiceStateStore.getVoiceStatesForChannel(current.channelId) ?? {};

    for (const userId of Object.keys(states)) {
        if (userId === me) continue;
        const user = UserStore.getUser(userId);
        if (user) current.withWhom.add(user.username);
    }
}

function LogModal(props: any) {
    log.use();

    const entries = log.entries.sort((a, b) => b[1].leftAt - a[1].leftAt);
    const total = entries.reduce((sum, [, entry]) => sum + (entry.leftAt - entry.joinedAt), 0);

    return (
        <XbtModal
            props={props}
            title="Call log"
            subtitle={entries.length ? `${formatDuration(total)} in calls, all told` : undefined}
            size="lg"
        >
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, entry]) => (
                        <Row
                            key={id}
                            title={entry.where}
                            preview={entry.withWhom.length ? `with ${entry.withWhom.join(", ")}` : "on your own"}
                            meta={`${formatDuration(entry.leftAt - entry.joinedAt)} - ended ${ago(entry.leftAt)}`}
                            actions={[{ label: "Remove", danger: true, onClick: () => log.delete(id) }]}
                        />
                    ))
                    : <Empty>No calls recorded yet.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => log.clear()}>Clear the log</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "CallLog",
    description: "Keeps a record of the voice calls you were in, how long they ran and who else was there",
    tags: ["Voice", "Utility", "Organisation"],
    searchTerms: ["call", "log", "voice", "history", "duration", "vc"],
    authors: [Devs.Xbtcord],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            const me = UserStore.getCurrentUser()?.id;
            if (!me) return;

            for (const state of voiceStates ?? []) {
                if (state?.userId !== me) {
                    // Somebody else moved. Only interesting while we are in a call, and
                    // only to note that they were there.
                    note();
                    continue;
                }

                const channelId = state.channelId ?? null;

                if (!channelId) {
                    end();
                } else if (!current) {
                    begin(channelId);
                } else if (current.channelId !== channelId) {
                    // Moved between channels: that is two calls, not one long one.
                    end();
                    begin(channelId);
                }
            }
        }
    },

    toolboxActions: {
        "Call log": () => openModal(props => <LogModal {...props} />)
    },

    async start() {
        await log.load();

        // Already in a call when the plugin is switched on - start counting from now
        // rather than pretending to know when it began.
        const channelId = SelectedChannelStore.getVoiceChannelId();
        if (channelId) begin(channelId);
    },

    stop: end
});
