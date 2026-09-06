/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import managedStyle from "./style.css?managed";

const settings = definePluginSettings({
    stopAnimations: {
        type: OptionType.BOOLEAN,
        description: "Cut transitions and animations across the client",
        default: true,
        onChange: apply
    }
});

function apply() {
    document.body.classList.toggle("xbt-reduce-motion", settings.store.stopAnimations);
}

/*
 * Animated avatars are deliberately not covered here.
 *
 * Freezing them means changing the URL Discord asks for from .gif to .webp, which lives
 * behind an internal it does not expose - and a webpack patch guessed at that would either
 * silently stop matching or, worse, match the wrong thing and break every avatar. The
 * existing AlwaysAnimate plugin patches that area from the opposite direction; if you want
 * still avatars, Discord's own Settings > Accessibility > "Play animated emoji" and the
 * "Automatically play GIFs" option are the supported way.
 */
export default definePlugin({
    name: "ReduceMotion",
    description: "Stops the client animating things, for a calmer or a slower machine",
    tags: ["Accessibility", "Appearance"],
    searchTerms: ["motion", "animation", "performance", "still", "lag", "accessibility"],
    authors: [Devs.Xbtcord],
    settings,
    managedStyle,

    start: apply,

    stop() {
        document.body.classList.remove("xbt-reduce-motion");
    }
});
