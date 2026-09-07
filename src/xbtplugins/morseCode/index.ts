/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

const TO_MORSE: Record<string, string> = {
    a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....",
    i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.",
    q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-",
    y: "-.--", z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.",
    "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", "=": "-...-",
    "+": ".-.-.", "-": "-....-", "@": ".--.-."
};

const FROM_MORSE: Record<string, string> = Object.fromEntries(
    Object.entries(TO_MORSE).map(([letter, code]) => [code, letter]));

export function encode(text: string) {
    // A slash is the conventional word separator, and a single space separates letters.
    return text.trim().toLowerCase().split(/\s+/)
        .map(word => [...word].map(character => TO_MORSE[character] ?? "").filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" / ");
}

export function decode(morse: string) {
    return morse.trim().split(/\s*\/\s*|\s{3,}/)
        .map(word => word.trim().split(/\s+/).map(code => FROM_MORSE[code] ?? "").join(""))
        .filter(Boolean)
        .join(" ");
}

export default definePlugin({
    name: "MorseCode",
    description: "Turns text into morse and back again, in the channel or just for you",
    tags: ["Fun", "Utility"],
    searchTerms: ["morse", "code", "encode", "decode", "dots", "dashes"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "morse",
            description: "Send some text as morse code",
            inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
            options: [
                {
                    name: "text",
                    description: "What to encode",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args) {
                const result = encode(findOption(args, "text", ""));
                if (!result) throw new Error("Nothing in there can be written in morse.");
                return { content: result };
            }
        },
        {
            name: "unmorse",
            description: "Read some morse code back as text, shown only to you",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "morse",
                    description: "The dots and dashes",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const result = decode(findOption(args, "morse", ""));
                sendBotMessage(ctx.channel.id, { content: result || "That did not decode as morse." });
            }
        }
    ]
});
