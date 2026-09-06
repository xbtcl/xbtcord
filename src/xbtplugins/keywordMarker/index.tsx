/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, Settings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Tooltip } from "@webpack/common";

const logger = new Logger("KeywordMarker");

const settings = definePluginSettings({
    keywords: {
        type: OptionType.STRING,
        description: "Words to mark, comma separated. Leave empty to reuse KeywordAlerts' list",
        default: ""
    },
    useRegex: {
        type: OptionType.BOOLEAN,
        description: "Treat each entry as a regular expression",
        default: false
    },
    wholeWordOnly: {
        type: OptionType.BOOLEAN,
        description: "Only match whole words (plain text mode only)",
        default: true
    }
});

/**
 * Falls back to KeywordAlerts' list when this one is empty.
 *
 * The two plugins answer the same question - "does this message mention something I care
 * about" - and keeping two lists in step by hand is the kind of chore that ends with them
 * disagreeing. Reading the other's setting is a plain object access; nothing is imported,
 * so this still works with KeywordAlerts disabled or absent.
 */
function rawKeywords(): string {
    const own = settings.store.keywords.trim();
    if (own) return own;

    return Settings.plugins?.KeywordAlerts?.keywords ?? "";
}

let compiled: RegExp[] = [];
let compiledFrom = "";

function patterns(): RegExp[] {
    const { useRegex, wholeWordOnly } = settings.store;
    const source = rawKeywords();
    const signature = `${source}|${useRegex}|${wholeWordOnly}`;
    if (signature === compiledFrom) return compiled;

    compiledFrom = signature;
    compiled = source
        .split(",")
        .map(k => k.trim())
        .filter(Boolean)
        .flatMap(keyword => {
            try {
                if (useRegex) return [new RegExp(keyword, "i")];
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return [new RegExp(wholeWordOnly ? `\\b${escaped}\\b` : escaped, "i")];
            } catch (err) {
                logger.warn(`Ignoring "${keyword}"`, err);
                return [];
            }
        });

    return compiled;
}

export default definePlugin({
    name: "KeywordMarker",
    description: "Marks messages that mention one of your keywords, so you can spot them scrolling back",
    tags: ["Chat", "Utility", "Accessibility"],
    searchTerms: ["keyword", "highlight", "mark", "watch", "flag"],
    authors: [Devs.Xbtcord],
    settings,

    renderMessageDecoration: ({ message }) => {
        try {
            const content = message?.content;
            if (!content) return null;

            const hit = patterns().find(re => re.test(content));
            if (!hit) return null;

            return (
                <Tooltip text="Mentions one of your keywords">
                    {tooltipProps => <span {...tooltipProps} className="xbt-keyword-mark" />}
                </Tooltip>
            );
        } catch (err) {
            logger.error("Failed to check a message", err);
            return null;
        }
    }
});
