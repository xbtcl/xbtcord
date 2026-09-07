/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

/*
 * TextReplace already exists for rules you write yourself. This is the other half of the
 * job: the handful of things everyone types wrong, fixed without having to write a rule
 * for each one.
 */
const COMMON: Record<string, string> = {
    teh: "the", adn: "and", nad: "and", taht: "that", thier: "their", recieve: "receive",
    seperate: "separate", definately: "definitely", occured: "occurred", untill: "until",
    wich: "which", becuase: "because", freind: "friend", wierd: "weird", alot: "a lot",
    dont: "don’t", cant: "can’t", wont: "won’t", im: "I’m", ive: "I’ve",
    youre: "you’re", theyre: "they’re", isnt: "isn’t", wasnt: "wasn’t",
    didnt: "didn’t", doesnt: "doesn’t", couldnt: "couldn’t",
    shouldnt: "shouldn’t", wouldnt: "wouldn’t", thats: "that’s",
    whats: "what’s", lets: "let’s",
    ok: "OK", pls: "please", ur: "your"
};

const settings = definePluginSettings({
    fixTypos: {
        type: OptionType.BOOLEAN,
        description: "Fix the built-in list of common misspellings",
        default: true
    },
    fixContractions: {
        type: OptionType.BOOLEAN,
        description: "Put the apostrophe back into dont, cant, im and friends",
        default: true
    },
    capitalise: {
        type: OptionType.BOOLEAN,
        description: "Capitalise the first letter of each sentence",
        default: false
    },
    capitaliseI: {
        type: OptionType.BOOLEAN,
        description: "Capitalise a lone i",
        default: true
    },
    skipShorthand: {
        type: OptionType.BOOLEAN,
        description: "Leave pls, ur and ok alone",
        default: true
    },
    extra: {
        type: OptionType.STRING,
        description: "Your own fixes, written as wrong=right and separated by commas",
        default: ""
    }
});

const CONTRACTIONS = new Set(["dont", "cant", "wont", "im", "ive", "youre", "theyre",
    "isnt", "wasnt", "didnt", "doesnt", "couldnt", "shouldnt", "wouldnt", "thats", "whats", "lets"]);
const SHORTHAND = new Set(["ok", "pls", "ur"]);

function customRules(): Record<string, string> {
    const rules: Record<string, string> = {};
    for (const pair of settings.store.extra.split(",")) {
        const [wrong, right] = pair.split("=").map(part => part.trim());
        if (wrong && right) rules[wrong.toLowerCase()] = right;
    }
    return rules;
}

/** Keeps the original capitalisation, so "Teh" becomes "The" rather than "the". */
function matchCase(original: string, replacement: string) {
    if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
    if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
}

function fixWords(part: string, custom: Record<string, string>): string {
    let result = part.replace(/[\p{L}’']+/gu, word => {
        const key = word.toLowerCase();

        if (custom[key]) return matchCase(word, custom[key]);
        if (settings.store.capitaliseI && key === "i") return "I";

        const replacement = COMMON[key];
        if (!replacement) return word;

        if (SHORTHAND.has(key)) return settings.store.skipShorthand ? word : matchCase(word, replacement);
        if (CONTRACTIONS.has(key)) return settings.store.fixContractions ? matchCase(word, replacement) : word;
        return settings.store.fixTypos ? matchCase(word, replacement) : word;
    });

    if (settings.store.capitalise) {
        result = result.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, prefix, letter) => prefix + letter.toUpperCase());
    }

    return result;
}

export function correct(text: string): string {
    const custom = customRules();

    /*
     * Code blocks, inline code, links, mentions and custom emoji are left exactly as
     * typed. Nothing is more annoying than a client rewriting the middle of a URL, and a
     * "fix" inside a code fence is always wrong.
     */
    const protectedRanges = /```[\s\S]*?```|`[^`]*`|<a?:\w+:\d+>|https?:\/\/\S+|<@!?\d+>|<#\d+>/g;
    const pieces: string[] = [];
    let last = 0;

    for (const match of text.matchAll(protectedRanges)) {
        pieces.push(fixWords(text.slice(last, match.index), custom));
        pieces.push(match[0]);
        last = match.index! + match[0].length;
    }
    pieces.push(fixWords(text.slice(last), custom));

    return pieces.join("");
}

export default definePlugin({
    name: "AutoCorrect",
    description: "Quietly fixes the typos everyone makes as you send - apostrophes, a lone i, teh, and anything you add yourself",
    tags: ["Utility", "Chat"],
    searchTerms: ["typo", "spelling", "correct", "apostrophe", "grammar"],
    authors: [Devs.Xbtcord],
    settings,

    onBeforeMessageSend(_channelId, message) {
        if (message.content) message.content = correct(message.content);
    },

    onBeforeMessageEdit(_channelId, _messageId, message) {
        if (message.content) message.content = correct(message.content);
    }
});
