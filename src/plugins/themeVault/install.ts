/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

import { VaultTheme } from "./api";

/**
 * Enabling a vault theme is deliberately *not* a download. Xbtcord's theme engine already
 * imports remote stylesheets by URL - `Settings.themeLinks` becomes a list of
 * `@import url(...)` lines - so a theme goes live by adding its raw CSS URL to that list.
 * No file lands on disk, and the author's own updates arrive without a reinstall.
 *
 * There is no separate "enabled" list for links here: `themeLinks` holds exactly the
 * themes that are applied, and `enabledThemes` is for local theme *files* only. So
 * switching a vault theme off means taking its URL out of the list rather than moving it
 * between two lists.
 */

function unique(links: string[]): string[] {
    return [...new Set(links.filter(Boolean))];
}

function links(): string[] {
    return Settings.themeLinks ?? [];
}

/** A link in the list is a link that is live, so "known" and "enabled" are the same thing. */
export function isKnown(theme: VaultTheme): boolean {
    return links().includes(theme.source);
}

export function isEnabled(theme: VaultTheme): boolean {
    return links().includes(theme.source);
}

export function enableTheme(theme: VaultTheme) {
    Settings.themeLinks = unique([...links(), theme.source]);
}

export function disableTheme(theme: VaultTheme) {
    Settings.themeLinks = links().filter(l => l !== theme.source);
}

export function setThemeEnabled(theme: VaultTheme, enabled: boolean) {
    enabled ? enableTheme(theme) : disableTheme(theme);
}

/** Same as disabling, since a link that isn't applied isn't stored at all. */
export function removeTheme(theme: VaultTheme) {
    disableTheme(theme);
}

/**
 * Switch a theme on as the *only* vault theme. Two full themes stacked on top of each
 * other almost always fight over the same selectors, so the grid offers this as the
 * default click action and keeps multi-enable behind a modifier.
 *
 * Links the user added themselves through the normal Themes tab are left alone - only
 * ones that came from the vault are cleared.
 */
export function enableExclusively(theme: VaultTheme, all: VaultTheme[]) {
    const vaultSources = new Set(all.map(t => t.source));
    const keep = links().filter(l => !vaultSources.has(l));

    Settings.themeLinks = unique([...keep, theme.source]);
}
