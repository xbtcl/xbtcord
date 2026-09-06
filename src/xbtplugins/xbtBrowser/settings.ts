/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { BrowserActions } from "./Actions";
import { DEFAULTS } from "./config";
import { SEARCH_ENGINES } from "./policy";

export const settings = definePluginSettings({
    interceptLinks: {
        type: OptionType.BOOLEAN,
        description: "Open links you click in Discord inside XbtBrowser instead of handing them to your real browser. Hold Ctrl (or Shift) while clicking to bypass this for one link.",
        default: DEFAULTS.interceptLinks
    },
    blockTrackers: {
        type: OptionType.BOOLEAN,
        description: "Cancel requests to known trackers, analytics and ad networks before the page can make them, using the same blocklist as XbtShield",
        default: DEFAULTS.blockTrackers
    },
    stripParams: {
        type: OptionType.BOOLEAN,
        description: "Remove click-tracking parameters (utm_*, fbclid, gclid and the rest) from every address before it is requested",
        default: DEFAULTS.stripParams
    },
    blockThirdPartyCookies: {
        type: OptionType.BOOLEAN,
        description: "Refuse cookies set by anyone other than the site you are actually on, and never send one to a third party. This is what stops a page following you to the next one.",
        default: DEFAULTS.blockThirdPartyCookies
    },
    sendDoNotTrack: {
        type: OptionType.BOOLEAN,
        description: "Send Do Not Track and Global Privacy Control headers. GPC is legally binding in some places; DNT mostly is not, but neither costs anything.",
        default: DEFAULTS.sendDoNotTrack
    },
    blockDownloads: {
        type: OptionType.BOOLEAN,
        description: "Refuse downloads started by a page in the isolated view. Turn this off only if you trust what you browse to - a drive-by download is the main way a page reaches your disk.",
        default: DEFAULTS.blockDownloads
    },
    persist: {
        type: OptionType.BOOLEAN,
        description: "Keep cookies, logins and cache between restarts. Off by default: the session lives in memory and is gone when Discord closes, so nothing you open can be linked to anything you opened before.",
        default: DEFAULTS.persist
    },
    searchEngine: {
        type: OptionType.SELECT,
        description: "Where the address bar sends anything that isn't an address",
        options: (Object.keys(SEARCH_ENGINES) as (keyof typeof SEARCH_ENGINES)[]).map(key => ({
            label: SEARCH_ENGINES[key].name,
            value: key,
            default: key === DEFAULTS.searchEngine
        }))
    },
    actions: {
        type: OptionType.COMPONENT,
        description: "Try it, or wipe what it has stored",
        component: BrowserActions
    }
});
