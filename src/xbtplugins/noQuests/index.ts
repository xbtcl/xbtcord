/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

import managedStyle from "./style.css?managed";

export default definePlugin({
    name: "NoQuests",
    description: "Hides the Quest bars, badges and popups Discord keeps putting in front of you",
    tags: ["Appearance", "Accessibility"],
    searchTerms: ["quest", "quests", "ad", "advert", "nag", "upsell", "promo"],
    authors: [Devs.Xbtcord],
    managedStyle
});
