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
    inline: {
        type: OptionType.SLIDER,
        description: "Size of emoji sent alongside text, in pixels",
        markers: [16, 20, 22, 26, 32, 40],
        default: 22,
        stickToMarkers: false,
        onChange: apply
    },
    jumbo: {
        type: OptionType.SLIDER,
        description: "Size of emoji in a message that is nothing but emoji, in pixels",
        markers: [32, 48, 64, 80, 96, 128],
        default: 48,
        stickToMarkers: false,
        onChange: apply
    }
});

/*
 * Driven through custom properties rather than by rewriting rules.
 *
 * The stylesheet is static and only reads two variables, so changing the slider is one
 * property write on <body> instead of tearing down and reinserting a <style> element -
 * which is what makes dragging the slider feel live rather than steppy.
 */
function apply() {
    const { style } = document.body;
    style.setProperty("--xbt-emoji-inline", `${settings.store.inline}px`);
    style.setProperty("--xbt-emoji-jumbo", `${settings.store.jumbo}px`);
}

export default definePlugin({
    name: "EmojiSize",
    description: "Sets how large emoji render, both inline and on their own",
    tags: ["Appearance", "Emotes", "Accessibility"],
    searchTerms: ["emoji", "size", "big", "small", "jumbo", "scale"],
    authors: [Devs.Xbtcord],
    settings,
    managedStyle,

    start: apply,

    stop() {
        document.body.style.removeProperty("--xbt-emoji-inline");
        document.body.style.removeProperty("--xbt-emoji-jumbo");
    }
});
