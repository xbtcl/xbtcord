/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VaultTheme } from "./api";

/**
 * Themes worth pointing at, pinned to the front of the grid.
 *
 * Matched on name and author rather than on the store's numeric id, because that id is
 * BetterDiscord's and a re-upload or a store migration changes it, which would silently
 * un-pin the theme. Name plus author survives both, and the comparison is case-insensitive
 * so a capitalisation change in the listing does not break it either.
 */
interface Pick {
    name: string;
    author: string;
    /** Shown on the badge, so a pick can say why it is picked. */
    label: string;
}

export const DEV_PICKS: Pick[] = [
    { name: "midnight", author: "refact0r", label: "Dev's pick" }
];

const norm = (s: string) => s.trim().toLowerCase();

export function getPick(theme: VaultTheme): Pick | undefined {
    return DEV_PICKS.find(p => norm(p.name) === norm(theme.name) && norm(p.author) === norm(theme.author));
}

export function isDevPick(theme: VaultTheme): boolean {
    return getPick(theme) != null;
}

/**
 * Moves picks to the front, keeping the chosen sort order among themselves and among
 * everything else. A pin that reordered the rest of the grid would make the sort control
 * feel broken.
 */
export function hoistPicks(themes: VaultTheme[]): VaultTheme[] {
    const picks: VaultTheme[] = [];
    const rest: VaultTheme[] = [];

    for (const theme of themes) (isDevPick(theme) ? picks : rest).push(theme);

    return [...picks, ...rest];
}
