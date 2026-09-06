/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function uuidv4(prefix: string) {
    return `${prefix}${crypto.randomUUID()}`;
}
