/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filters, mapMangledModuleLazy, waitFor } from "@webpack";
import type * as t from "@xbtcord/discord-types";

export const Menu = {} as t.Menu;

waitFor(filters.componentByCode('path:["empty"]'), m => Menu.Menu = m);
// Newer Discord builds rewrote the menu slider as a class component without "SLIDER)"; match either.
const isOlderSlider = filters.componentByCode("SLIDER)", "handleSize:16");
const isClassSlider = filters.componentByCode("handleSize:16", "_mediaBar");
waitFor(m => isOlderSlider(m) || isClassSlider(m), m => Menu.MenuSliderControl = m);
waitFor(filters.componentByCode(".SEARCH)", ".focus()", "query:"), m => Menu.MenuSearchControl = m);

export const ContextMenuApi: t.ContextMenuApi = mapMangledModuleLazy('type:"CONTEXT_MENU_OPEN', {
    closeContextMenu: filters.byCode("CONTEXT_MENU_CLOSE"),
    openContextMenu: filters.byCode("renderLazy:"),
    openContextMenuLazy: e => typeof e === "function" && e.toString().length < 100
});
