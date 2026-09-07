/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";

function randomString(length: number, alphabet: string) {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, value => alphabet[value % alphabet.length]).join("");
}

export default definePlugin({
    name: "UuidGen",
    description: "Generates UUIDs and strong passwords without leaving Discord or trusting a website with them",
    tags: ["Utility", "Developers"],
    searchTerms: ["uuid", "guid", "random", "token", "password", "generate"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "uuid",
            description: "Generate a random UUID and copy it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "count",
                    description: "How many, up to 20. Defaults to one",
                    type: ApplicationCommandOptionType.INTEGER,
                    required: false
                }
            ],
            execute(args, ctx) {
                const count = Math.min(20, Math.max(1, findOption(args, "count", 1)));
                const list = Array.from({ length: count }, () => crypto.randomUUID());

                copyWithToast(list.join("\n"), `Copied ${count} UUID${count === 1 ? "" : "s"}`);
                sendBotMessage(ctx.channel.id, { content: list.map(value => `\`${value}\``).join("\n") });
            }
        },
        {
            name: "password",
            description: "Generate a strong password and copy it. It is never sent anywhere",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "length",
                    description: "How long, between 8 and 128. Defaults to 24",
                    type: ApplicationCommandOptionType.INTEGER,
                    required: false
                },
                {
                    name: "symbols",
                    description: "Include punctuation. Defaults to yes",
                    type: ApplicationCommandOptionType.BOOLEAN,
                    required: false
                }
            ],
            execute(args, ctx) {
                const length = Math.min(128, Math.max(8, findOption(args, "length", 24)));
                const symbols = findOption(args, "symbols", true);

                const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
                    + (symbols ? "!@#$%^&*()-_=+[]{};:,.<>?" : "");

                copyWithToast(randomString(length, alphabet), "Password copied. It only went to your clipboard");

                /*
                 * Deliberately never echoed into the channel, not even as a local-only
                 * bot message. Those are still drawn on screen, and screen is exactly
                 * where a fresh password should not be while someone is streaming.
                 */
                sendBotMessage(ctx.channel.id, { content: `Copied a ${length} character password to your clipboard.` });
            }
        }
    ]
});
