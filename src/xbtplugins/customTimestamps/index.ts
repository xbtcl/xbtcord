/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { moment } from "@webpack/common";

const logger = new Logger("CustomTimestamps");

const settings = definePluginSettings({
    sameDay: {
        type: OptionType.STRING,
        description: "Today. Moment format; text in [square brackets] is literal",
        default: "[Today at] HH:mm",
        onChange: apply
    },
    lastDay: {
        type: OptionType.STRING,
        description: "Yesterday",
        default: "[Yesterday at] HH:mm",
        onChange: apply
    },
    lastWeek: {
        type: OptionType.STRING,
        description: "Within the last week",
        default: "ddd DD/MM/YYYY HH:mm",
        onChange: apply
    },
    sameElse: {
        type: OptionType.STRING,
        description: "Anything older",
        default: "DD/MM/YYYY HH:mm",
        onChange: apply
    }
});

/**
 * Original formats, so disabling the plugin puts them back exactly.
 *
 * moment.updateLocale merges rather than replaces, so there is no "reset" call - the only
 * way back is to have kept what was there.
 */
let original: Record<string, unknown> | null = null;

/*
 * Done through moment's locale rather than by patching Discord.
 *
 * Discord renders message timestamps through moment's calendar formats, so overriding those
 * changes every timestamp at once with nothing to keep in step with Discord's internals.
 * The trade is that it is not surgical: anything else in the client that formats a calendar
 * date through moment follows these formats too.
 */
function apply() {
    try {
        const locale = moment.locale();
        const current = (moment.localeData() as any)._calendar;

        original ??= { ...current };

        moment.updateLocale(locale, {
            calendar: {
                ...current,
                sameDay: settings.store.sameDay,
                lastDay: settings.store.lastDay,
                lastWeek: settings.store.lastWeek,
                sameElse: settings.store.sameElse
            }
        });
    } catch (err) {
        logger.error("Couldn't apply the timestamp formats", err);
    }
}

export default definePlugin({
    name: "CustomTimestamps",
    description: "Choose how message timestamps are written, including a 24 hour clock",
    tags: ["Appearance", "Customisation", "Accessibility"],
    searchTerms: ["timestamp", "time", "date", "format", "24 hour", "clock"],
    authors: [Devs.Xbtcord],
    settings,

    start: apply,

    stop() {
        if (!original) return;
        try {
            moment.updateLocale(moment.locale(), { calendar: original as any });
        } catch (err) {
            logger.error("Couldn't restore the timestamp formats", err);
        }
    }
});
