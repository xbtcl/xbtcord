/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { makeCodeblock } from "@utils/text";
import definePlugin from "@utils/types";

const ALGORITHMS = ["SHA-256", "SHA-1", "SHA-384", "SHA-512"] as const;

/*
 * SubtleCrypto has no MD5, and that is not worth working around - anyone who still needs
 * an MD5 in 2026 is checking a download against a checksum a vendor should have replaced
 * years ago. The four here are the ones the platform gives us for free.
 */
async function digest(algorithm: string, text: string) {
    const bytes = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export default definePlugin({
    name: "HashTool",
    description: "Hashes text with SHA-1, SHA-256, SHA-384 or SHA-512 locally, so a checksum never has to go through a website",
    tags: ["Utility", "Developers"],
    searchTerms: ["hash", "sha", "sha256", "checksum", "digest", "crypto"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "hash",
            description: "Hash some text and copy the result",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "What to hash",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "algorithm",
                    description: "Which algorithm. Defaults to SHA-256",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: ALGORITHMS.map(name => ({ name, value: name, label: name }))
                }
            ],
            async execute(args, ctx) {
                const text = findOption(args, "text", "");
                const algorithm = findOption(args, "algorithm", "SHA-256");

                const hex = await digest(algorithm, text);

                copyWithToast(hex, `${algorithm} copied`);
                sendBotMessage(ctx.channel.id, { content: `${algorithm}\n${makeCodeblock(hex)}` });
            }
        }
    ]
});
