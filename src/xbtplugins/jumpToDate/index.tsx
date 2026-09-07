/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption } from "@api/Commands";
import { Button } from "@components/Button";
import { ClockIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, openModal, SnowflakeUtils, TextInput, useState } from "@webpack/common";
import { XbtModal } from "@xbtplugins/_shared/ui";
import { jumpToMessage } from "@xbtplugins/_shared/util";

/*
 * A Discord id is a timestamp with a few counters glued to the bottom, so an id built
 * from a date lands exactly where that date would have been - no search, no API call, and
 * it works just as well in a channel with four years of history as in one with four
 * messages. Discord itself uses this for its jump-to-date; it just does not expose it.
 */
function jumpTo(channelId: string, date: Date) {
    jumpToMessage(channelId, SnowflakeUtils.fromTimestamp(date.getTime()));
}

/** Accepts a date, or a date and a time, in the order the user is already used to. */
function parseWhen(input: string): Date | null {
    const text = input.trim();
    if (!text) return null;

    // A bare yyyy-mm-dd is parsed as UTC midnight by Date, which lands people on the
    // wrong day west of Greenwich. Building it by parts keeps it local.
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(text);
    if (iso) {
        return new Date(
            Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
            Number(iso[4] ?? 0), Number(iso[5] ?? 0));
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function JumpModal({ channelId, ...props }: { channelId: string; } & any) {
    const [value, setValue] = useState(new Date().toISOString().slice(0, 10));

    const parsed = parseWhen(value);
    const valid = !!parsed && parsed.getTime() > Date.UTC(2015, 0, 1) && parsed.getTime() <= Date.now();

    return (
        <XbtModal props={props} title="Jump to a date" subtitle="Anywhere in this channel, without scrolling for it" size="sm">
            <div className="xbt-form">
                <TextInput
                    value={value}
                    onChange={setValue}
                    placeholder="2024-03-17, or 2024-03-17 21:30"
                    autoFocus
                />
                <div className="xbt-row-meta">
                    {parsed
                        ? valid
                            ? parsed.toLocaleString()
                            : "Discord did not exist then, or that is in the future."
                        : "Type a date."}
                </div>
                <Button
                    disabled={!valid}
                    onClick={() => { jumpTo(channelId, parsed!); props.onClose(); }}
                >
                    Jump
                </Button>
            </div>
        </XbtModal>
    );
}

function open(channelId?: string) {
    const id = channelId ?? getCurrentChannel()?.id;
    if (!id) return;
    openModal(props => <JumpModal {...props} channelId={id} />);
}

export default definePlugin({
    name: "JumpToDate",
    description: "Jumps straight to a date in a channel, however far back it is, without scrolling or searching",
    tags: ["Utility", "Shortcuts"],
    searchTerms: ["jump", "date", "history", "scroll", "old", "archive"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: { id: string; }; }) => {
            if (!channel) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-jump-to-date"
                    label="Jump to a date"
                    icon={ClockIcon}
                    action={() => open(channel.id)}
                />
            );
        }
    },

    commands: [
        {
            name: "jumpto",
            description: "Jump to a date in this channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "date",
                    description: "Something like 2024-03-17. Leave it out to pick one",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args, ctx) {
                const raw = findOption(args, "date", "");
                const parsed = raw ? parseWhen(raw) : null;

                if (parsed) jumpTo(ctx.channel.id, parsed);
                else open(ctx.channel.id);
            }
        }
    ],

    toolboxActions: {
        "Jump to a date": () => open()
    }
});
