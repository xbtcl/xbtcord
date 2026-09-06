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

export interface Reminder {
    id: string;
    channelId: string;
    messageId: string;
    channelName: string;
    author: string;
    avatarUrl?: string;
    preview: string;
    note?: string;
    createdAt: number;
    dueAt: number;
}

export const reminders = new PersistedRecord<Reminder>("Xbtcord_MessageReminders");

/**
 * Cancelling has to go through the plugin, which owns the live timers - a reminder
 * removed from storage alone would still fire. Required lazily because index.tsx
 * imports this file, and importing it back at module scope would be circular.
 */
function cancel(id: string) {
    require("./index").cancelReminder(id);
}

function RemindersList({ close }: { close(): void; }) {
    const all = reminders.use();
    const pending = Object.values(all).sort((a, b) => a.dueAt - b.dueAt);

    if (!pending.length) {
        return <div className="xbt-empty">Nothing pending. Right-click a message and pick <b>Remind me</b>.</div>;
    }

    return (
        <div className="xbt-list">
            {pending.map(reminder => (
                <div className="xbt-row" key={reminder.id}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{reminder.author} in {reminder.channelName}</Text>
                        <Text variant="text-sm/normal" className="xbt-row-preview">{reminder.preview}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">
                            in {formatDuration(reminder.dueAt - Date.now())} &middot; {new Date(reminder.dueAt).toLocaleString()}
                        </Text>
                    </div>
                    <div className="xbt-row-actions">
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                                jumpToMessage(reminder.channelId, reminder.messageId);
                                close();
                            }}
                        >
                            Jump
                        </Button>
                        <Button size="small" variant="dangerSecondary" onClick={() => cancel(reminder.id)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function openRemindersModal() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Reminders"
                subtitle="Messages you asked to be nudged about"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <RemindersList close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}
