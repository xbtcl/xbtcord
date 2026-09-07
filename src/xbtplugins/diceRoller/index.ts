/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    onlyMe: {
        type: OptionType.BOOLEAN,
        description: "Show results only to you, instead of sending them to the channel",
        default: false
    },
    showBreakdown: {
        type: OptionType.BOOLEAN,
        description: "Show each die alongside the total",
        default: true
    }
});

interface Roll {
    dice: number[];
    modifier: number;
    total: number;
    notation: string;
}

/** Standard dice notation: 2d20+3, d6, 4d8-1. */
export function roll(notation: string): Roll {
    const match = /^\s*(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(notation);
    if (!match) throw new Error(`"${notation}" is not dice notation. Try 2d20+3.`);

    const count = Math.min(100, Math.max(1, Number(match[1] || 1)));
    const sides = Math.min(1000, Math.max(2, Number(match[2])));
    const modifier = match[3] ? Number(match[3].replace(/\s+/g, "")) : 0;

    // crypto is right there, and a fair d20 costs nothing.
    const values = new Uint32Array(count);
    crypto.getRandomValues(values);

    const dice = Array.from(values, value => (value % sides) + 1);
    const total = dice.reduce((sum, value) => sum + value, 0) + modifier;
    const suffix = modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : "";

    return { dice, modifier, total, notation: `${count}d${sides}${suffix}` };
}

function describe(result: Roll) {
    const parts = [`**${result.total}**`, `(${result.notation})`];

    if (settings.store.showBreakdown && result.dice.length > 1) {
        const sign = result.modifier > 0 ? " + " : " - ";
        const tail = result.modifier ? sign + Math.abs(result.modifier) : "";
        parts.push(`- ${result.dice.join(", ")}${tail}`);
    }

    return parts.join(" ");
}

/** Either sends the text, or shows it only to you, depending on the setting. */
function deliver(channelId: string, content: string) {
    if (!settings.store.onlyMe) return { content };
    sendBotMessage(channelId, { content });
    return undefined;
}

export default definePlugin({
    name: "DiceRoller",
    description: "Rolls dice, flips coins and picks from a list, using real randomness rather than Math.random",
    tags: ["Fun", "Utility"],
    searchTerms: ["dice", "roll", "d20", "coin", "flip", "random", "pick", "choose"],
    authors: [Devs.Xbtcord],
    settings,

    commands: [
        {
            name: "roll",
            description: "Roll dice in standard notation, like 2d20+3",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            options: [
                {
                    name: "dice",
                    description: "The notation to roll. Defaults to a single d20",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args, ctx) {
                return deliver(ctx.channel.id, describe(roll(findOption(args, "dice", "1d20"))));
            }
        },
        {
            name: "flip",
            description: "Flip a coin",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            execute(_args, ctx) {
                const value = new Uint8Array(1);
                crypto.getRandomValues(value);
                return deliver(ctx.channel.id, value[0] % 2 ? "**Heads**" : "**Tails**");
            }
        },
        {
            name: "pick",
            description: "Pick one of several options at random",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            options: [
                {
                    name: "options",
                    description: "The choices, separated by commas",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const options = findOption(args, "options", "")
                    .split(",")
                    .map(option => option.trim())
                    .filter(Boolean);

                if (options.length < 2) throw new Error("Give me at least two options, separated by commas.");

                const value = new Uint32Array(1);
                crypto.getRandomValues(value);
                return deliver(ctx.channel.id, `**${options[value[0] % options.length]}**`);
            }
        }
    ]
});
