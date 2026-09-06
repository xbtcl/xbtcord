/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Menu, showToast, Toasts, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { describeChannel, jumpToMessage, parseDuration, setLongTimeout } from "@xbtplugins/_shared/util";

import { openRemindersModal, Reminder, reminders } from "./reminders";

const settings = definePluginSettings({
    quickPresets: {
        type: OptionType.STRING,
        description: "Durations offered in the Remind me menu, comma separated",
        default: "10m, 1h, 3h, 1d"
    },
    notifyOnStartup: {
        type: OptionType.BOOLEAN,
        description: "Show reminders that came due while Discord was closed",
        default: true
    }
});

/** Live timers, so a reminder cancelled from the list stops firing. */
const timers = new Map<string, () => void>();

function fire(reminder: Reminder) {
    timers.delete(reminder.id);
    reminders.delete(reminder.id);

    showNotification({
        title: `Reminder - ${reminder.channelName}`,
        body: reminder.note || reminder.preview || "You asked to be reminded about this message.",
        icon: reminder.avatarUrl,
        permanent: true,
        onClick: () => jumpToMessage(reminder.channelId, reminder.messageId)
    });
}

function schedule(reminder: Reminder) {
    timers.get(reminder.id)?.();
    timers.set(reminder.id, setLongTimeout(() => fire(reminder), reminder.dueAt - Date.now()));
}

export function addReminder(message: Message, delayMs: number, note?: string) {
    const author = UserStore.getUser(message.author.id);

    const reminder: Reminder = {
        id: `${message.channel_id}-${message.id}-${Date.now()}`,
        channelId: message.channel_id,
        messageId: message.id,
        channelName: describeChannel(message.channel_id),
        author: author?.username ?? message.author.username,
        avatarUrl: author?.getAvatarURL?.(undefined, 128) ?? undefined,
        preview: (message.content || "(no text)").slice(0, 140),
        note,
        createdAt: Date.now(),
        dueAt: Date.now() + delayMs
    };

    reminders.set(reminder.id, reminder);
    schedule(reminder);
    showToast(`Reminder set for ${new Date(reminder.dueAt).toLocaleString()}`, Toasts.Type.SUCCESS);
}

export function cancelReminder(id: string) {
    timers.get(id)?.();
    timers.delete(id);
    reminders.delete(id);
}

function presets() {
    return settings.store.quickPresets
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map(label => ({ label, ms: parseDuration(label) }))
        .filter((p): p is { label: string; ms: number; } => p.ms != null);
}

function RemindMenu({ message }: { message: Message; }) {
    return (
        <Menu.MenuItem id="xbt-remind-me" label="Remind me" icon={ClockIcon}>
            {presets().map(({ label, ms }) => (
                <Menu.MenuItem
                    key={label}
                    id={`xbt-remind-${label}`}
                    label={`In ${label}`}
                    action={() => addReminder(message, ms)}
                />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="xbt-remind-list"
                label="View all reminders"
                action={openRemindersModal}
            />
        </Menu.MenuItem>
    );
}

export default definePlugin({
    name: "MessageReminders",
    description: "Snooze a message and get a notification later that takes you straight back to it",
    tags: ["Chat", "Utility", "Notifications"],
    searchTerms: ["remind", "reminder", "snooze", "later", "todo"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        message: (children, { message }: { message: Message; }) => {
            if (!message) return;
            children.push(<RemindMenu message={message} />);
        }
    },

    messagePopoverButton: {
        icon: ClockIcon,
        render(message) {
            const list = presets();
            if (!list.length) return null;

            return {
                label: `Remind me in ${list[0].label}`,
                icon: ClockIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => addReminder(message, list[0].ms),
                onContextMenu: e => {
                    e.preventDefault();
                    openRemindersModal();
                }
            };
        }
    },

    toolboxActions: {
        "Reminders": openRemindersModal
    },

    async start() {
        await reminders.load();

        for (const [, reminder] of reminders.entries) {
            // Reminders that came due while Discord was shut are still worth showing -
            // silently dropping them is the one failure mode that makes the feature
            // untrustworthy.
            if (reminder.dueAt <= Date.now()) {
                if (settings.store.notifyOnStartup) fire(reminder);
                else reminders.delete(reminder.id);
            } else {
                schedule(reminder);
            }
        }
    },

    stop() {
        for (const cancel of timers.values()) cancel();
        timers.clear();
    }
});
