/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

/*
 * These are party tricks, not privacy. Caesar and Atbash were broken in the ninth century
 * and anything you "encrypt" with them is readable by anyone who cares - the description
 * says so, because a client mod quietly implying otherwise would be worse than not
 * shipping this at all.
 */
export function caesar(text: string, shift: number) {
    const offset = ((shift % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, character => {
        const base = character <= "Z" ? 65 : 97;
        return String.fromCharCode(((character.charCodeAt(0) - base + offset) % 26) + base);
    });
}

export function atbash(text: string) {
    return text.replace(/[a-z]/gi, character => {
        const base = character <= "Z" ? 65 : 97;
        return String.fromCharCode(base + 25 - (character.charCodeAt(0) - base));
    });
}

/** Vigenere, with anything that is not a letter left in place and skipped by the key. */
export function vigenere(text: string, key: string, decrypt = false) {
    const letters = key.toLowerCase().replace(/[^a-z]/g, "");
    if (!letters) throw new Error("The key has to contain at least one letter.");

    let index = 0;
    return text.replace(/[a-z]/gi, character => {
        const base = character <= "Z" ? 65 : 97;
        const shift = letters.charCodeAt(index++ % letters.length) - 97;
        const offset = decrypt ? 26 - shift : shift;
        return String.fromCharCode(((character.charCodeAt(0) - base + offset) % 26) + base);
    });
}

export default definePlugin({
    name: "CipherTool",
    description: "Caesar, Atbash and Vigenere, for puzzles and jokes. These are toys - do not use them to hide anything that matters",
    tags: ["Fun", "Utility"],
    searchTerms: ["cipher", "caesar", "rot", "atbash", "vigenere", "encrypt", "decode", "puzzle"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "cipher",
            description: "Encode text with a classical cipher and send it",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            options: [
                {
                    name: "text",
                    description: "What to encode",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "kind",
                    description: "Which cipher. Defaults to Caesar",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: [
                        { name: "caesar", value: "caesar", label: "Caesar" },
                        { name: "atbash", value: "atbash", label: "Atbash" },
                        { name: "vigenere", value: "vigenere", label: "Vigenere" }
                    ]
                },
                {
                    name: "key",
                    description: "A shift for Caesar, or a word for Vigenere",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args) {
                const text = findOption(args, "text", "");
                const kind: string = findOption(args, "kind", "caesar");
                const key = findOption(args, "key", "");

                if (kind === "atbash") return { content: atbash(text) };
                if (kind === "vigenere") return { content: vigenere(text, key || "key") };
                return { content: caesar(text, Number(key) || 13) };
            }
        },
        {
            name: "decipher",
            description: "Decode a classical cipher, shown only to you",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "What to decode",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "kind",
                    description: "Which cipher. Defaults to trying every Caesar shift",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: [
                        { name: "bruteforce", value: "bruteforce", label: "Try every shift" },
                        { name: "atbash", value: "atbash", label: "Atbash" },
                        { name: "vigenere", value: "vigenere", label: "Vigenere" }
                    ]
                },
                {
                    name: "key",
                    description: "The Vigenere key",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute(args, ctx) {
                const text = findOption(args, "text", "");
                const kind: string = findOption(args, "kind", "bruteforce");
                const key = findOption(args, "key", "");

                if (kind === "atbash") {
                    sendBotMessage(ctx.channel.id, { content: atbash(text) });
                    return;
                }

                if (kind === "vigenere") {
                    sendBotMessage(ctx.channel.id, { content: vigenere(text, key, true) });
                    return;
                }

                // Twenty-five lines is a small enough haystack to just read.
                const lines = Array.from({ length: 25 }, (_, index) => {
                    const shift = String(index + 1).padStart(2, " ");
                    return `\`${shift}\` ${caesar(text, -(index + 1))}`;
                });
                sendBotMessage(ctx.channel.id, { content: lines.join("\n").slice(0, 1900) });
            }
        }
    ]
});
