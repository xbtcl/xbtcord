/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, TextInput, useState } from "@webpack/common";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

const logger = new Logger("StatusRotator");

const CustomStatusSetting = getUserSettingLazy<any>("status", "customStatus")!;

interface Line {
    text: string;
    emoji: string;
}

const lines = new PersistedRecord<Line>("Xbtcord_StatusRotator");

const settings = definePluginSettings({
    everyMinutes: {
        type: OptionType.NUMBER,
        description: "Change the status this often, in minutes",
        default: 30
    },
    shuffle: {
        type: OptionType.BOOLEAN,
        description: "Pick at random instead of going in order",
        default: false
    }
});

/*
 * StatusSchedule sets a status at a time of day. This is the other pattern people ask
 * for: a handful of lines that cycle, so the status is not the same one from four months
 * ago. Both write through the same user setting, so running both is fine - whichever
 * fired last wins, which is the behaviour you would expect.
 */
let index = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function apply(line: Line) {
    try {
        CustomStatusSetting.updateSetting({
            text: line.text,
            emojiId: "0",
            emojiName: line.emoji || "",
            expiresAtMs: "0",
            createdAtMs: String(Date.now())
        });
    } catch (err) {
        logger.error("Could not set the status", err);
    }
}

function rotate() {
    const all = lines.entries;
    if (!all.length) return;

    if (settings.store.shuffle) index = Math.floor(Math.random() * all.length);
    else index = (index + 1) % all.length;

    apply(all[index][1]);
}

function RotatorModal(props: any) {
    lines.use();

    const [text, setText] = useState("");
    const [emoji, setEmoji] = useState("");

    const { entries } = lines;

    return (
        <XbtModal props={props} title="Status rotation" subtitle={`Changes every ${settings.store.everyMinutes} minutes`}>
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <TextInput value={text} onChange={setText} placeholder="Status text" />
                    <TextInput value={emoji} onChange={setEmoji} placeholder="Emoji" />
                    <Button
                        size="small"
                        disabled={!text.trim()}
                        onClick={() => { lines.set(makeId(), { text: text.trim(), emoji: emoji.trim() }); setText(""); setEmoji(""); }}
                    >
                        Add
                    </Button>
                </div>
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, line]) => (
                        <Row
                            key={id}
                            title={`${line.emoji ? `${line.emoji} ` : ""}${line.text}`}
                            actions={[
                                { label: "Use now", onClick: () => apply(line) },
                                { label: "Remove", danger: true, onClick: () => lines.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Add a few lines and they will take turns.</Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "StatusRotator",
    description: "Cycles your custom status through a list you write, so it is never the same one from four months ago",
    tags: ["Utility", "Activity"],
    searchTerms: ["status", "rotate", "cycle", "custom status", "random"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Status rotation": () => openModal(props => <RotatorModal {...props} />)
    },

    async start() {
        await lines.load();
        timer = setInterval(rotate, Math.max(1, settings.store.everyMinutes) * 60_000);
    },

    stop() {
        clearInterval(timer);
    }
});
