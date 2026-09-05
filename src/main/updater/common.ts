/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const XBTCORD_FILES = [
    IS_DISCORD_DESKTOP ? "patcher.js" : "xbtcordDesktopMain.js",
    IS_DISCORD_DESKTOP ? "preload.js" : "xbtcordDesktopPreload.js",
    IS_DISCORD_DESKTOP ? "renderer.js" : "xbtcordDesktopRenderer.js",
    IS_DISCORD_DESKTOP ? "renderer.css" : "xbtcordDesktopRenderer.css",
];

export function serializeErrors(func: (...args: any[]) => any) {
    return async function () {
        try {
            return {
                ok: true,
                value: await func(...arguments)
            };
        } catch (e: any) {
            return {
                ok: false,
                error: e instanceof Error ? {
                    // prototypes get lost, so turn error into plain object
                    ...e,
                    message: e.message,
                    name: e.name,
                    stack: e.stack
                } : e
            };
        }
    };
}
