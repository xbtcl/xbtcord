/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, openModal, showToast, TextInput, Toasts, UserStore, useState } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Birthday {
    name: string;
    /** Month, 1 to 12. */
    month: number;
    day: number;
    /** The year we last told them about it, so it fires once per birthday. */
    lastNotifiedYear?: number;
}

const birthdays = new PersistedRecord<Birthday>("Xbtcord_Birthdays");

const settings = definePluginSettings({
    daysAhead: {
        type: OptionType.NUMBER,
        description: "Warn this many days early as well as on the day",
        default: 1
    }
});

/*
 * Deliberately no year. Storing a friend's date of birth in full is a real piece of
 * personal data and this only ever needs to know the day - so it does not ask for the
 * year, and there is nothing here worth leaking.
 */
function parse(input: string): { month: number; day: number; } | null {
    const match = /^(\d{1,2})\s*[-/.]\s*(\d{1,2})$/.exec(input.trim());
    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return { month, day };
}

function daysUntil(birthday: Birthday, now = new Date()) {
    const thisYear = new Date(now.getFullYear(), birthday.month - 1, birthday.day);
    const target = thisYear.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        ? new Date(now.getFullYear() + 1, birthday.month - 1, birthday.day)
        : thisYear;

    return Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
}

function check() {
    const now = new Date();

    for (const [id, birthday] of birthdays.entries) {
        const away = daysUntil(birthday, now);
        if (away > Math.max(0, settings.store.daysAhead)) continue;
        if (birthday.lastNotifiedYear === now.getFullYear()) continue;

        showNotification({
            title: away === 0 ? `It is ${birthday.name}'s birthday` : `${birthday.name}'s birthday is in ${away} day(s)`,
            body: away === 0 ? "Today." : "Worth saying something.",
            permanent: true
        });

        birthdays.set(id, { ...birthday, lastNotifiedYear: now.getFullYear() });
    }
}

function BirthdaysModal(props: any) {
    birthdays.use();

    const entries = birthdays.entries.sort((a, b) => daysUntil(a[1]) - daysUntil(b[1]));

    return (
        <XbtModal props={props} title="Birthdays" subtitle="Kept on this machine, day and month only">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, birthday]) => {
                        const away = daysUntil(birthday);
                        return (
                            <Row
                                key={id}
                                title={birthday.name}
                                meta={away === 0 ? "Today" : `in ${away} day${away === 1 ? "" : "s"} (${birthday.day}/${birthday.month})`}
                                actions={[{ label: "Remove", danger: true, onClick: () => birthdays.delete(id) }]}
                            />
                        );
                    })
                    : <Empty>Nobody added yet. Right click someone and pick Set birthday.</Empty>
                }
            </div>
        </XbtModal>
    );
}

function AddModal({ user, ...props }: { user: User; } & any) {
    const [value, setValue] = useState("");
    const parsed = parse(value);

    return (
        <XbtModal props={props} title={`${user.username}'s birthday`} subtitle="Day and month, as dd/mm" size="sm">
            <div className="xbt-form">
                <TextInput value={value} onChange={setValue} placeholder="17/03" autoFocus />
                <Button
                    disabled={!parsed}
                    onClick={() => {
                        birthdays.set(user.id, { name: user.username, ...parsed! });
                        showToast("Saved", Toasts.Type.SUCCESS);
                        props.onClose();
                    }}
                >
                    Save
                </Button>
            </div>
        </XbtModal>
    );
}

let daily: ReturnType<typeof setInterval> | undefined;

export default definePlugin({
    name: "BirthdayReminder",
    description: "Remembers your friends birthdays and tells you the day before, without asking for the year",
    tags: ["Utility", "Friends", "Notifications"],
    searchTerms: ["birthday", "reminder", "friends", "date", "anniversary"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user?.id || user.id === UserStore.getCurrentUser()?.id) return;

            const existing = birthdays.get(user.id);

            children.push(
                <Menu.MenuItem
                    id="xbt-birthday"
                    label={existing ? `Birthday: ${existing.day}/${existing.month}` : "Set birthday"}
                    icon={ClockIcon}
                    action={() => openModal(props => <AddModal {...props} user={user} />)}
                />
            );
        }
    },

    toolboxActions: {
        "Birthdays": () => openModal(props => <BirthdaysModal {...props} />)
    },

    async start() {
        await birthdays.load();
        check();
        // Once an hour is enough to catch midnight without a timer that has to survive
        // sleep and clock changes.
        daily = setInterval(check, 3_600_000);
    },

    stop() {
        clearInterval(daily);
    }
});
