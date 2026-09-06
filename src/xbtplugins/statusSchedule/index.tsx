/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Modal, openModal, Select, Text, TextInput, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";

const logger = new Logger("StatusSchedule");

const StatusSetting = getUserSettingLazy<string>("status", "status")!;
const CustomStatusSetting = getUserSettingLazy<any>("status", "customStatus")!;

type Presence = "online" | "idle" | "dnd" | "invisible";

interface Rule {
    id: string;
    /** Local time of day, `HH:MM`. */
    at: string;
    presence: Presence;
    customText: string;
    /** 0 is Sunday, matching Date#getDay. Empty means every day. */
    days: number[];
    enabled: boolean;
}

const rules = new PersistedRecord<Rule>("Xbtcord_StatusSchedule");

const settings = definePluginSettings({
    setCustomStatus: {
        type: OptionType.BOOLEAN,
        description: "Also set the custom status text from the rule",
        default: true
    }
});

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRESENCE_OPTIONS = [
    { label: "Online", value: "online" },
    { label: "Idle", value: "idle" },
    { label: "Do not disturb", value: "dnd" },
    { label: "Invisible", value: "invisible" }
];

function minutesOf(at: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
}

function apply(rule: Rule) {
    try {
        StatusSetting.updateSetting(rule.presence);

        if (settings.store.setCustomStatus && rule.customText.trim()) {
            CustomStatusSetting.updateSetting({
                text: rule.customText.trim(),
                emojiId: "0",
                emojiName: "",
                expiresAtMs: "0",
                createdAtMs: String(Date.now())
            });
        }
    } catch (err) {
        logger.error("Couldn't apply a rule", err);
    }
}

/**
 * The last minute we acted on, so a rule fires once rather than every tick inside its
 * minute. Reset across restarts on purpose: coming back online during a rule's minute
 * should apply it.
 */
let lastFiredMinute = -1;

function tick() {
    const now = new Date();
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    if (minuteOfDay === lastFiredMinute) return;
    lastFiredMinute = minuteOfDay;

    for (const [, rule] of rules.entries) {
        if (!rule.enabled) continue;
        if (rule.days.length && !rule.days.includes(now.getDay())) continue;
        if (minutesOf(rule.at) !== minuteOfDay) continue;

        apply(rule);
    }
}

function RuleEditor() {
    const all = rules.use();
    const [at, setAt] = useState("09:00");
    const [presence, setPresence] = useState<Presence>("online");
    const [customText, setCustomText] = useState("");

    const list = Object.values(all).sort((a, b) => (minutesOf(a.at) ?? 0) - (minutesOf(b.at) ?? 0));

    const add = () => {
        if (minutesOf(at) == null) return;
        const id = makeId();
        rules.set(id, { id, at: at.trim(), presence, customText, days: [], enabled: true });
        setCustomText("");
    };

    const toggleDay = (rule: Rule, day: number) => {
        const days = rule.days.includes(day) ? rule.days.filter(d => d !== day) : [...rule.days, day].sort();
        rules.set(rule.id, { ...rule, days });
    };

    return (
        <>
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <TextInput value={at} onChange={setAt} placeholder="09:00" fullWidth />
                    <div style={{ minWidth: 180 }}>
                        <Select
                            options={PRESENCE_OPTIONS}
                            select={value => setPresence(value)}
                            isSelected={value => value === presence}
                            serialize={String}
                        />
                    </div>
                </div>
                <div className="xbt-form-row">
                    <TextInput value={customText} onChange={setCustomText} placeholder="Custom status text (optional)" fullWidth />
                    <Button size="small" onClick={add} disabled={minutesOf(at) == null}>Add rule</Button>
                </div>
            </div>

            {!list.length
                ? <div className="xbt-empty">No rules yet. Add one above - times are your local clock.</div>
                : (
                    <div className="xbt-list">
                        {list.map(rule => (
                            <div className="xbt-row" key={rule.id}>
                                <div className="xbt-row-body">
                                    <Text variant="text-sm/semibold">
                                        {rule.at} &rarr; {PRESENCE_OPTIONS.find(o => o.value === rule.presence)?.label}
                                    </Text>
                                    {!!rule.customText && (
                                        <Text variant="text-sm/normal" className="xbt-row-preview">{rule.customText}</Text>
                                    )}
                                    <div className="xbt-form-row" style={{ marginTop: 4 }}>
                                        <div />
                                        {DAY_NAMES.map((name, day) => (
                                            <button
                                                key={name}
                                                className={`xbt-tag${rule.days.length === 0 || rule.days.includes(day) ? " xbt-tag-active" : ""}`}
                                                onClick={() => toggleDay(rule, day)}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="xbt-row-actions">
                                    <Button
                                        size="small"
                                        variant={rule.enabled ? "secondary" : "primary"}
                                        onClick={() => rules.set(rule.id, { ...rule, enabled: !rule.enabled })}
                                    >
                                        {rule.enabled ? "Pause" : "Resume"}
                                    </Button>
                                    <Button size="small" variant="dangerSecondary" onClick={() => rules.delete(rule.id)}>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
        </>
    );
}

function openSchedule() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Status schedule"
                subtitle="Rules only run while Discord is open"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <RuleEditor />
            </Modal>
        </ErrorBoundary>
    ));
}

let ticker: ReturnType<typeof setInterval> | undefined;

export default definePlugin({
    name: "StatusSchedule",
    description: "Switch your status automatically at times you choose",
    tags: ["Activity", "Customisation", "Utility"],
    searchTerms: ["status", "schedule", "presence", "dnd", "idle", "automatic"],
    authors: [Devs.Xbtcord],
    dependencies: ["UserSettingsAPI"],
    settings,

    settingsAboutComponent: () => (
        <Button onClick={openSchedule}>Edit the schedule</Button>
    ),

    toolboxActions: {
        "Status schedule": openSchedule
    },

    async start() {
        await rules.load();
        // Once a minute is plenty for something that only cares about HH:MM, and it keeps
        // the plugin off the hot path entirely.
        ticker = setInterval(tick, 20_000);
        tick();
    },

    stop() {
        clearInterval(ticker);
        ticker = undefined;
    }
});
