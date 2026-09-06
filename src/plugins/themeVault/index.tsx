/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PaintbrushIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import ThemeVaultNavButton from "./NavButton";
import { settings } from "./settings";

const ENTRY_KEY = "xbtcord_theme_vault";

export default definePlugin({
    name: "ThemeVault",
    description: "Browse and switch on every theme from the BetterDiscord store without leaving Discord",
    authors: [Devs.Xbtcord],
    tags: ["Appearance", "Customisation"],
    enabledByDefault: true,
    settings,

    toolboxActions: {
        "Open Theme Vault": () => SettingsRouter.openUserSettings(`${ENTRY_KEY}_panel`)
    },

    patches: [
        {
            // The nav list above your DMs - Friends, Shop, Quests. Its children are a
            // plain array of jsx() calls keyed by name, so the vault row is inserted
            // just before the divider that closes the section.
            find: 'tutorialId:"direct-messages"',
            predicate: () => settings.store.showInSidebar,
            replacement: {
                match: /(,\(0,\i\.jsx\)\(\i,\{\},"section-divider-top"\))/,
                replace: ",$self.NavButton()$1"
            }
        }
    ],

    NavButton: () => <ThemeVaultNavButton />,

    start() {
        SettingsPlugin.customEntries.push({
            key: ENTRY_KEY,
            title: "Theme Vault",
            Component: require("./components/VaultTab").default,
            Icon: PaintbrushIcon
        });
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, e => e.key === ENTRY_KEY);
    }
});
