/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { openModal } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { formatDuration } from "@xbtplugins/_shared/util";

/** Minutes spent with the window focused, keyed by yyyy-mm-dd. */
const days = new PersistedRecord<number>("Xbtcord_SessionTimer");

const settings = definePluginSettings({
    onlyWhenFocused: {
        type: OptionType.BOOLEAN,
        description: "Only count time while the window is actually in front of you",
        default: true
    },
    remindAfterHours: {
        type: OptionType.NUMBER,
        description: "Nudge you once you pass this many hours in a day. Zero turns it off",
        default: 0
    }
});

function key(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

let ticker: ReturnType<typeof setInterval> | undefined;
let remindedFor: string | null = null;

function tick() {
    if (settings.store.onlyWhenFocused && document.visibilityState !== "visible") return;

    const today = key();
    const minutes = (days.get(today) ?? 0) + 1;
    days.set(today, minutes);

    const limit = settings.store.remindAfterHours;
    if (!limit || remindedFor === today) return;

    if (minutes >= limit * 60) {
        remindedFor = today;
        showNotification({
            title: "Screen time",
            body: `That is ${formatDuration(minutes * 60_000)} on Discord today.`
        });
    }
}

function SessionModal(props: any) {
    days.use();

    const entries = days.entries.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
    const week = entries.slice(0, 7).reduce((sum, [, minutes]) => sum + minutes, 0);

    return (
        <XbtModal
            props={props}
            title="Time on Discord"
            subtitle={entries.length ? `${formatDuration(week * 60_000)} over the last seven days` : undefined}
        >
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([day, minutes]) => (
                        <Row
                            key={day}
                            title={day === key() ? "Today" : new Date(`${day}T00:00`).toLocaleDateString()}
                            meta={formatDuration(minutes * 60_000)}
                        />
                    ))
                    : <Empty>Nothing counted yet.</Empty>
                }
            </div>

            {!!entries.length && (
                <div style={{ marginTop: 12 }}>
                    <Button size="small" variant="dangerPrimary" onClick={() => days.clear()}>Clear the history</Button>
                </div>
            )}
        </XbtModal>
    );
}

export default definePlugin({
    name: "SessionTimer",
    description: "Quietly counts how long you spend in Discord each day, and can nudge you once it gets silly",
    tags: ["Utility", "Accessibility"],
    searchTerms: ["screen time", "session", "usage", "hours", "timer", "wellbeing"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Time on Discord": () => openModal(props => <SessionModal {...props} />)
    },

    async start() {
        await days.load();
        // A minute at a time. Anything finer would write to IndexedDB constantly for a
        // number nobody reads to the second.
        ticker = setInterval(tick, 60_000);
    },

    stop() {
        clearInterval(ticker);
    }
});
