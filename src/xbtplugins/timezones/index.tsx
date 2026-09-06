/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, Modal, openModal, Text, TextInput, Tooltip, useMemo, useState } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";

interface Zone {
    timezone: string;
    username: string;
}

const zones = new PersistedRecord<Zone>("Xbtcord_Timezones");

const settings = definePluginSettings({
    showOnMessages: {
        type: OptionType.BOOLEAN,
        description: "Show the sender's local time next to their messages",
        default: true
    },
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Show local time in the member list",
        default: false
    },
    use24Hour: {
        type: OptionType.BOOLEAN,
        description: "Use a 24 hour clock",
        default: false
    }
});

/**
 * Every zone the runtime knows about, for the picker.
 *
 * `supportedValuesOf` is not in every engine this could run on, so a miss falls back to
 * a free text field - a wrong string just fails to format and is caught below.
 */
function allZones(): string[] {
    try {
        return (Intl as any).supportedValuesOf?.("timeZone") ?? [];
    } catch {
        return [];
    }
}

function formatIn(timezone: string): string | null {
    try {
        return new Intl.DateTimeFormat(undefined, {
            timeZone: timezone,
            hour: "numeric",
            minute: "2-digit",
            hour12: !settings.store.use24Hour
        }).format(new Date());
    } catch {
        return null;
    }
}

/** Roughly how far ahead or behind they are, which is the bit people actually want. */
function offsetFrom(timezone: string): string {
    try {
        const now = new Date();
        const there = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
        const here = new Date(now.toLocaleString("en-US"));
        const hours = Math.round((there.getTime() - here.getTime()) / 3_600_000 * 2) / 2;

        if (hours === 0) return "same time as you";
        return `${Math.abs(hours)}h ${hours > 0 ? "ahead of" : "behind"} you`;
    } catch {
        return "";
    }
}

function LocalTime({ userId, className }: { userId: string; className?: string; }) {
    const all = zones.use();
    const entry = all[userId];
    if (!entry) return null;

    const time = formatIn(entry.timezone);
    if (!time) return null;

    return (
        <Tooltip text={`${entry.timezone} - ${offsetFrom(entry.timezone)}`}>
            {tooltipProps => (
                <span {...tooltipProps} className={className}>{time}</span>
            )}
        </Tooltip>
    );
}

function ZonePicker({ user, close }: { user: User; close(): void; }) {
    const existing = zones.get(user.id)?.timezone ?? "";
    const [query, setQuery] = useState(existing);

    const options = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const list = allZones();
        if (!needle) return list.slice(0, 40);
        return list.filter(z => z.toLowerCase().includes(needle)).slice(0, 40);
    }, [query]);

    const apply = (timezone: string) => {
        zones.set(user.id, { timezone, username: user.username });
        close();
    };

    return (
        <>
            <div className="xbt-form">
                <TextInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Search, e.g. London, Tokyo, New_York"
                    fullWidth
                    clearable
                />
                {!options.length && (
                    <div className="xbt-form-row">
                        <Text variant="text-sm/normal">
                            No match. You can still set "{query}" if you know it is right.
                        </Text>
                        <Button size="small" onClick={() => apply(query.trim())} disabled={!query.trim()}>Use it</Button>
                    </div>
                )}
            </div>

            <div className="xbt-list">
                {options.map(zone => (
                    <div className="xbt-row" key={zone}>
                        <div className="xbt-row-body">
                            <Text variant="text-sm/semibold">{zone}</Text>
                            <Text variant="text-xs/normal" className="xbt-row-meta">
                                {formatIn(zone)} &middot; {offsetFrom(zone)}
                            </Text>
                        </div>
                        <div className="xbt-row-actions">
                            <Button size="small" variant={zone === existing ? "primary" : "secondary"} onClick={() => apply(zone)}>
                                {zone === existing ? "Current" : "Set"}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function openPicker(user: User) {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title={`Timezone for ${user.username}`}
                subtitle="Stored on this machine only - nobody is told you set it"
                size="md"
                actions={[
                    {
                        text: "Clear",
                        variant: "secondary",
                        onClick: () => {
                            zones.delete(user.id);
                            props.onClose();
                        }
                    },
                    { text: "Close", variant: "primary", onClick: props.onClose }
                ]}
            >
                <ZonePicker user={user} close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "Timezones",
    description: "Note down what timezone someone is in and see their local time on their messages",
    tags: ["Utility", "Friends"],
    searchTerms: ["timezone", "time", "local", "clock", "utc"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-set-timezone"
                    label={zones.has(user.id) ? "Change timezone" : "Set timezone"}
                    icon={ClockIcon}
                    action={() => openPicker(user)}
                />
            );
        }
    },

    renderMessageDecoration: ({ message }) => {
        if (!settings.store.showOnMessages || !message?.author?.id) return null;
        return <LocalTime userId={message.author.id} className="xbt-timezone" />;
    },

    renderMemberListDecorator: ({ user }) => {
        if (!settings.store.showInMemberList || !user?.id) return null;
        return <LocalTime userId={user.id} className="xbt-timezone" />;
    },

    start: () => zones.load()
});
