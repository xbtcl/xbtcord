/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    glass: {
        type: OptionType.BOOLEAN,
        description: "Frosted-glass panels - translucent with a backdrop blur, no background image. Falls back to solid where the renderer can't blur.",
        default: true
    },
    showInSidebar: {
        type: OptionType.BOOLEAN,
        description: "Show a Theme Vault row in the sidebar above your DMs, next to Friends and Shop",
        default: true,
        restartNeeded: true
    },
    exclusive: {
        type: OptionType.BOOLEAN,
        description: "Switching a theme on turns off any other Theme Vault theme. Two full themes stacked together usually fight over the same selectors, so this is on by default.",
        default: true
    }
});
