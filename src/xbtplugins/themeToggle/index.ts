/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, Settings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const settings = definePluginSettings({
    setA: {
        type: OptionType.STRING,
        description: "The first set - theme file names, comma separated. Leave empty for no theme at all",
        default: ""
    },
    setB: {
        type: OptionType.STRING,
        description: "The second set - theme file names, comma separated",
        default: ""
    },
    hotkey: {
        type: OptionType.BOOLEAN,
        description: "Switch with Ctrl+Alt+T as well as from the toolbox",
        default: true
    }
});

/*
 * Two named sets rather than a full theme manager. Switching between a light theme for
 * daytime and a dark one for the evening is the thing people actually do, and doing it by
 * hand means unticking three boxes and ticking three others in the settings tab.
 *
 * These are the same enabledThemes the Local Themes tab writes, so whichever set is live
 * is exactly what that tab shows - nothing is hidden or shadowed.
 */
function parse(value: string): string[] {
    return value.split(",").map(name => name.trim()).filter(Boolean);
}

function same(a: string[], b: string[]) {
    return a.length === b.length && a.every(name => b.includes(name));
}

export function toggle() {
    const a = parse(settings.store.setA);
    const b = parse(settings.store.setB);

    if (!a.length && !b.length) {
        showToast("Set at least one of the two theme sets first", Toasts.Type.FAILURE);
        return;
    }

    const current = Settings.enabledThemes ?? [];
    const next = same(current, b) ? a : b;

    Settings.enabledThemes = next;
    showToast(next.length ? `Switched to ${next.join(", ")}` : "Themes off", Toasts.Type.SUCCESS);
}

function onKeyDown(event: KeyboardEvent) {
    if (!settings.store.hotkey) return;
    if (!event.ctrlKey || !event.altKey || event.key.toLowerCase() !== "t") return;

    event.preventDefault();
    toggle();
}

export default definePlugin({
    name: "ThemeToggle",
    description: "Flips between two sets of local themes with one key, for a light one by day and a dark one by night",
    tags: ["Appearance", "Customisation", "Shortcuts"],
    searchTerms: ["theme", "toggle", "switch", "light", "dark", "hotkey"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Switch themes": toggle
    },

    start() {
        window.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
