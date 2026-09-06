/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

const logger = new Logger("BlockedWords");

const settings = definePluginSettings({
    words: {
        type: OptionType.STRING,
        description: "Words to hide messages for, comma separated",
        default: "",
        restartNeeded: false
    },
    useRegex: {
        type: OptionType.BOOLEAN,
        description: "Treat each entry as a regular expression",
        default: false
    },
    wholeWordOnly: {
        type: OptionType.BOOLEAN,
        description: "Only match whole words, so 'ass' does not hit 'passage' (plain text mode only)",
        default: true
    },
    hideOwnMessages: {
        type: OptionType.BOOLEAN,
        description: "Also hide your own messages when they match",
        default: false
    },
    checkEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Also check embed titles and descriptions",
        default: true
    }
});

let compiled: RegExp[] = [];
let compiledFrom = "";

function patterns(): RegExp[] {
    const { words, useRegex, wholeWordOnly } = settings.store;
    const signature = `${words}|${useRegex}|${wholeWordOnly}`;
    if (signature === compiledFrom) return compiled;

    compiledFrom = signature;
    compiled = words
        .split(",")
        .map(w => w.trim())
        .filter(Boolean)
        .flatMap(word => {
            try {
                if (useRegex) return [new RegExp(word, "i")];
                const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return [new RegExp(wholeWordOnly ? `\\b${escaped}\\b` : escaped, "i")];
            } catch (err) {
                logger.warn(`Ignoring "${word}" - it isn't a valid pattern`, err);
                return [];
            }
        });

    return compiled;
}

export default definePlugin({
    name: "BlockedWords",
    description: "Hides any message containing a word you would rather not read",
    tags: ["Chat", "Privacy", "Accessibility"],
    searchTerms: ["mute", "filter", "word", "block", "hide", "censor", "spoiler"],
    authors: [Devs.Xbtcord],
    settings,

    /**
     * Called from the message renderer. It has to be cheap and it must never throw -
     * an exception here takes the whole message list down with it.
     */
    shouldHideMessage(message: Message | undefined): boolean {
        try {
            if (!message) return false;

            const list = patterns();
            if (!list.length) return false;

            if (!settings.store.hideOwnMessages && message.author?.id === UserStore.getCurrentUser()?.id) return false;

            let haystack = message.content ?? "";

            if (settings.store.checkEmbeds && message.embeds?.length) {
                for (const embed of message.embeds as any[]) {
                    haystack += `\n${embed?.rawTitle ?? embed?.title ?? ""}\n${embed?.rawDescription ?? embed?.description ?? ""}`;
                }
            }

            if (!haystack.trim()) return false;

            return list.some(re => re.test(haystack));
        } catch (err) {
            logger.error("Failed to check a message", err);
            return false;
        }
    },

    patches: [
        {
            // The same anchor ClientSideBlock uses to drop a message before it renders.
            // Both can be on at once: the original text is kept by $&, so the second
            // patch still finds it.
            find: ".NITRO_NOTIFICATION,[",
            replacement: {
                match: /\i\(\)\(\i\.type.{0,40}Message must not be a thread starter message/,
                replace: "if($self.shouldHideMessage(arguments[0]?.message)) return null;$&"
            }
        }
    ]
});
