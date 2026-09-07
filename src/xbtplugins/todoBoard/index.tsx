/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { NotesIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, openModal, TextInput, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { makeId, PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Task {
    text: string;
    done: boolean;
    at: number;
    doneAt?: number;
    channelId?: string;
    messageId?: string;
}

const tasks = new PersistedRecord<Task>("Xbtcord_TodoBoard");

const settings = definePluginSettings({
    hideDone: {
        type: OptionType.BOOLEAN,
        description: "Hide finished tasks in the list",
        default: false
    },
    clearAfterDays: {
        type: OptionType.NUMBER,
        description: "Forget finished tasks after this many days. Zero keeps them forever",
        default: 7
    }
});

function add(text: string, channelId?: string, messageId?: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    tasks.set(makeId(), { text: trimmed, done: false, at: Date.now(), channelId, messageId });
}

function sweepFinished() {
    const days = settings.store.clearAfterDays;
    if (!days) return;

    const cutoff = Date.now() - days * 86_400_000;
    for (const [id, task] of tasks.entries) {
        if (task.done && (task.doneAt ?? 0) < cutoff) tasks.delete(id);
    }
}

function BoardModal(props: any) {
    tasks.use();

    const [draft, setDraft] = useState("");

    const entries = tasks.entries
        .filter(([, task]) => !settings.store.hideDone || !task.done)
        .sort((a, b) => Number(a[1].done) - Number(b[1].done) || b[1].at - a[1].at);

    const outstanding = tasks.entries.filter(([, task]) => !task.done).length;

    return (
        <XbtModal props={props} title="To do" subtitle={`${outstanding} still open`} size="md">
            <div className="xbt-form">
                <div className="xbt-form-row">
                    <TextInput
                        value={draft}
                        onChange={setDraft}
                        placeholder="What needs doing?"
                        onKeyDown={(event: any) => {
                            if (event.key !== "Enter") return;
                            add(draft);
                            setDraft("");
                        }}
                    />
                    <Button size="small" onClick={() => { add(draft); setDraft(""); }}>Add</Button>
                </div>
            </div>

            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, task]) => (
                        <Row
                            key={id}
                            title={task.done ? <s>{task.text}</s> : task.text}
                            meta={task.done ? `done ${ago(task.doneAt ?? task.at)}` : `added ${ago(task.at)}`}
                            actions={[
                                {
                                    label: task.done ? "Undo" : "Done",
                                    onClick: () => tasks.set(id, { ...task, done: !task.done, doneAt: Date.now() })
                                },
                                ...(task.channelId
                                    ? [{
                                        label: "Jump",
                                        onClick: () => { jumpToMessage(task.channelId!, task.messageId); props.onClose(); }
                                    }]
                                    : []),
                                { label: "Remove", danger: true, onClick: () => tasks.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>Nothing on the list. Add something above, or turn a message into a task.</Empty>
                }
            </div>
        </XbtModal>
    );
}

const open = () => openModal(props => <BoardModal {...props} />);

export default definePlugin({
    name: "TodoBoard",
    description: "A to do list that lives in Discord, and can take a task straight off a message so you keep the link back to it",
    tags: ["Utility", "Organisation"],
    searchTerms: ["todo", "task", "list", "checklist", "board", "reminder"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            if (!message?.content) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-todo-add"
                    label="Add to my to do list"
                    icon={NotesIcon}
                    action={() => add(
                        `${message.content.slice(0, 120)} (${message.author?.username ?? "someone"} in ${describeChannel(message.channel_id)})`,
                        message.channel_id,
                        message.id)}
                />
            );
        }
    },

    toolboxActions: {
        "To do": open
    },

    async start() {
        await tasks.load();
        sweepFinished();
    }
});
