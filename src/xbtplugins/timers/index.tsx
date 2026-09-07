/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import { showNotification } from "@api/Notifications";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { openModal, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { formatDuration, parseDuration, setLongTimeout } from "@xbtplugins/_shared/util";

interface Timer {
    label: string;
    dueAt: number;
}

const timers = new PersistedRecord<Timer>("Xbtcord_Timers");

/** Live cancel functions, so deleting a timer actually stops it firing. */
const running = new Map<string, () => void>();

function fire(id: string) {
    const timer = timers.get(id);
    running.delete(id);
    timers.delete(id);

    if (!timer) return;

    showNotification({
        title: "Timer",
        body: timer.label,
        permanent: true
    });
}

function schedule(id: string, timer: Timer) {
    running.get(id)?.();
    running.set(id, setLongTimeout(() => fire(id), timer.dueAt - Date.now()));
}

export function addTimer(label: string, ms: number) {
    const id = makeId();
    const timer: Timer = { label: label.trim() || "Time is up", dueAt: Date.now() + ms };

    timers.set(id, timer);
    schedule(id, timer);

    showToast(`Timer set for ${formatDuration(ms)}`, Toasts.Type.SUCCESS);
}

function cancel(id: string) {
    running.get(id)?.();
    running.delete(id);
    timers.delete(id);
}

function TimersModal(props: any) {
    timers.use();

    const [label, setLabel] = useState("");
    const [duration, setDuration] = useState("10m");
    const [, force] = useState(0);

    // The list shows a live countdown, so it repaints once a second while it is open.
    useEffect(() => {
        const handle = setInterval(() => force(value => value + 1), 1000);
        return () => clearInterval(handle);
    }, []);

    const entries = timers.entries.sort((a, b) => a[1].dueAt - b[1].dueAt);

    function add() {
        const ms = parseDuration(duration);
        if (ms == null || ms <= 0) {
            showToast("That is not a duration. Try 10m, 2h30m or 90", Toasts.Type.FAILURE);
            return;
        }
        addTimer(label, ms);
        setLabel("");
    }

    return (
        <XbtModal props={props} title="Timers" subtitle="They survive a restart, and fire late rather than not at all">
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <TextInput value={label} onChange={setLabel} placeholder="What is it for?" />
                    <TextInput value={duration} onChange={setDuration} placeholder="10m" />
                    <Button size="small" onClick={add}>Set</Button>
                </div>
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, timer]) => (
                        <Row
                            key={id}
                            title={timer.label}
                            meta={`${formatDuration(timer.dueAt - Date.now())} to go`}
                            actions={[{ label: "Cancel", danger: true, onClick: () => cancel(id) }]}
                        />
                    ))
                    : <Empty>No timers running.</Empty>
                }
            </div>
        </XbtModal>
    );
}

const open = () => openModal(props => <TimersModal {...props} />);

export default definePlugin({
    name: "Timers",
    description: "Plain countdown timers that keep running across a restart and tell you when they are up",
    tags: ["Utility", "Notifications"],
    searchTerms: ["timer", "countdown", "alarm", "remind", "stopwatch"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "timer",
            description: "Set a timer",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "duration",
                    description: "How long. 10m, 2h30m, or a bare number for minutes",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "label",
                    description: "What it is for",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args) {
                const ms = parseDuration(findOption(args, "duration", ""));
                if (ms == null || ms <= 0) throw new Error("That is not a duration. Try 10m, 2h30m or 90.");
                addTimer(findOption(args, "label", ""), ms);
            }
        }
    ],

    toolboxActions: {
        "Timers": open
    },

    async start() {
        await timers.load();

        /*
         * Anything that came due while the client was closed fires straight away rather
         * than being silently dropped - a timer you set for twenty minutes and then
         * restarted through should still tell you it went off.
         */
        for (const [id, timer] of timers.entries) {
            if (timer.dueAt <= Date.now()) fire(id);
            else schedule(id, timer);
        }
    },

    stop() {
        for (const cancelTimer of running.values()) cancelTimer();
        running.clear();
    }
});
