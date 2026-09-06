/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { findCssClassesLazy } from "@webpack";
import { SettingsRouter } from "@webpack/common";

/**
 * A "Theme Vault" row in the DM sidebar, sitting with Friends / Shop / Quests.
 *
 * A theme store buried three levels into settings may as well not exist, so it gets a
 * spot in the list people actually look at.
 *
 * The classes are looked up rather than hardcoded: Discord's are content-hashed
 * (`channel__972a0`) and change whenever they rebuild that module. Reusing them is what
 * makes this row indistinguishable from Discord's own - same height, hover, and active
 * treatment - without reimplementing any of it.
 */

const cl = classNameFactory("tc-vault-");

const NavClasses = findCssClassesLazy("channel", "link", "linkButton", "linkButtonIcon", "interactive", "avatarWithText");
const LayoutClasses = findCssClassesLazy("layout", "avatar");

/**
 * The generic interactive-row class, from a different module than the nav-specific one
 * above. It carries the rounded corners and hover fill; without it the row is square and
 * doesn't light up. Looked up as a triple because `interactive` alone matches several
 * modules - the muted/selected siblings pin it to the right one.
 */
const RowClasses = findCssClassesLazy("interactive", "muted", "selected");

function PaletteIcon() {
    return (
        <svg
            className={NavClasses.linkButtonIcon}
            aria-hidden="true"
            role="img"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
        >
            <path
                fill="currentColor"
                d="M12 2a10 10 0 0 0 0 20c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.5 1.5 0 0 1 1.12-2.49H16a5 5 0 0 0 5-5c0-5.5-4.03-10-9-10Zm-5.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
            />
        </svg>
    );
}

function ThemeVaultNavButton() {
    return (
        <li className={classes(NavClasses.channel, cl("row"))} role="listitem">
            <div className={classes(RowClasses.interactive, NavClasses.interactive, NavClasses.linkButton)}>
                <a
                    className={NavClasses.link}
                    role="button"
                    tabIndex={-1}
                    onClick={e => {
                        e.preventDefault();
                        SettingsRouter.openUserSettings("xbtcord_theme_vault_panel");
                    }}
                >
                    <div className={classes(LayoutClasses.layout, NavClasses.avatarWithText)}>
                        <div className={LayoutClasses.avatar}>
                            <PaletteIcon />
                        </div>
                        <div>Theme Vault</div>
                    </div>
                </a>
            </div>
        </li>
    );
}

export default ErrorBoundary.wrap(ThemeVaultNavButton, { noop: true });
