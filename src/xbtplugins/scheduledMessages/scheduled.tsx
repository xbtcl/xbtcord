/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Modal, openModal, Text } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { formatDuration, jumpToMessage } from "@xbtplugins/_shared/util";

export interface ScheduledMessage {
    id: string;
    channelId: string;
    channelName: string;
    content: string;
    createdAt: number;
    sendAt: number;
}

export const scheduled = new PersistedRecord<ScheduledMessage>("Xbtcord_ScheduledMessages");

function act(name: "cancelScheduled" | "sendNow", id: string) {
    // index.tsx owns the timers and the send path; required lazily to keep the two
    // files from importing each other at module scope.
    require("./index")[name](id);
}

function ScheduledList({ close }: { close(): void; }) {
    const all = scheduled.use();
    const pending = Object.values(all).sort((a, b) => a.sendAt - b.sendAt);

    if (!pending.length) {
        return <div className="xbt-empty">Nothing queued. Use <b>/schedule</b> in any channel.</div>;
    }

    return (
        <div className="xbt-list">
            {pending.map(item => (
                <div className="xbt-row" key={item.id}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{item.channelName}</Text>
                        <Text variant="text-sm/normal" className="xbt-row-preview">{item.content}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">
                            sends in {formatDuration(item.sendAt - Date.now())} &middot; {new Date(item.sendAt).toLocaleString()}
                        </Text>
                    </div>
                    <div className="xbt-row-actions">
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                                jumpToMessage(item.channelId);
                                close();
                            }}
                        >
                            Go
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => act("sendNow", item.id)}>
                            Send now
                        </Button>
                        <Button size="small" variant="dangerSecondary" onClick={() => act("cancelScheduled", item.id)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function openScheduledModal() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Scheduled messages"
                subtitle="Queued on this machine - they only send while Discord is open"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <ScheduledList close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}
