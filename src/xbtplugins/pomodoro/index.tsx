/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";
import "./styles.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, useEffect, useState } from "@webpack/common";
import { XbtModal } from "@xbtplugins/_shared/ui";

const settings = definePluginSettings({
    focusMinutes: {
        type: OptionType.NUMBER,
        description: "How long a focus block lasts",
        default: 25
    },
    breakMinutes: {
        type: OptionType.NUMBER,
        description: "How long a short break lasts",
        default: 5
    },
    longBreakMinutes: {
        type: OptionType.NUMBER,
        description: "How long the break after four blocks lasts",
        default: 20
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Raise a notification when a block ends",
        default: true
    }
});

type Phase = "focus" | "break" | "long";

interface State {
    phase: Phase;
    /** When the current phase runs out, or null when nothing is running. */
    endsAt: number | null;
    completed: number;
}

let state: State = { phase: "focus", endsAt: null, completed: 0 };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function update(next: Partial<State>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
}

function lengthOf(phase: Phase) {
    const minutes = phase === "focus" ? settings.store.focusMinutes
        : phase === "break" ? settings.store.breakMinutes
            : settings.store.longBreakMinutes;
    return Math.max(1, minutes) * 60_000;
}

function start(phase: Phase) {
    update({ phase, endsAt: Date.now() + lengthOf(phase) });
}

function stop() {
    update({ endsAt: null });
}

/**
 * Advances to whatever comes next.
 *
 * Four focus blocks then a long break is the shape everybody expects from a pomodoro
 * timer, so the count drives the choice rather than a setting nobody would change.
 */
function advance() {
    if (state.phase === "focus") {
        const completed = state.completed + 1;
        update({ completed });
        start(completed % 4 === 0 ? "long" : "break");
    } else {
        start("focus");
    }
}

function tick() {
    if (state.endsAt === null || Date.now() < state.endsAt) {
        // Still running, but the modal needs a repaint for the countdown.
        if (state.endsAt !== null) for (const listener of listeners) listener();
        return;
    }

    const finished = state.phase;

    if (settings.store.notify) {
        showNotification({
            title: finished === "focus" ? "Focus block done" : "Break over",
            body: finished === "focus" ? "Take a break." : "Back to it.",
            permanent: true
        });
    }

    advance();
}

function remaining() {
    if (state.endsAt === null) return lengthOf(state.phase);
    return Math.max(0, state.endsAt - Date.now());
}

function clock(ms: number) {
    const total = Math.ceil(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function PomodoroModal(props: any) {
    const [, force] = useState(0);

    useEffect(() => {
        const listener = () => force(value => value + 1);
        listeners.add(listener);
        return () => void listeners.delete(listener);
    }, []);

    const running = state.endsAt !== null;
    const label = state.phase === "focus" ? "Focus" : state.phase === "break" ? "Break" : "Long break";

    return (
        <XbtModal props={props} title="Pomodoro" subtitle={`${state.completed} block(s) done today`} size="sm">
            <div className="xbt-pomodoro">
                <div className="xbt-pomodoro-phase">{label}</div>
                <div className="xbt-pomodoro-clock">{clock(remaining())}</div>
            </div>

            <div className="xbt-form-row" style={{ marginTop: 12 }}>
                <Button onClick={() => running ? stop() : start(state.phase)}>
                    {running ? "Pause" : "Start"}
                </Button>
                <Button variant="secondary" onClick={advance}>Skip</Button>
                <Button
                    variant="dangerPrimary"
                    onClick={() => update({ phase: "focus", endsAt: null, completed: 0 })}
                >
                    Reset
                </Button>
            </div>
        </XbtModal>
    );
}

const open = () => openModal(props => <PomodoroModal {...props} />);

export default definePlugin({
    name: "Pomodoro",
    description: "A focus timer in the toolbox - four blocks of work, a break between each and a longer one at the end",
    tags: ["Utility", "Organisation"],
    searchTerms: ["pomodoro", "timer", "focus", "study", "break", "work"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Pomodoro": open
    },

    start() {
        ticker = setInterval(tick, 1000);
    },

    stop() {
        clearInterval(ticker);
        state = { phase: "focus", endsAt: null, completed: 0 };
        listeners.clear();
    }
});
