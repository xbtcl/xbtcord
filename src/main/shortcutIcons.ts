/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { shell } from "electron";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

/*
 * Puts the Xbtcord icon back on Discord's shortcuts after a Discord update.
 *
 * The installer sets these once. Discord's own updater then recreates its shortcuts every
 * time it moves to a new app-x.y.z folder, and the new ones carry Discord's icon again -
 * so the mark quietly disappears a few days after installing and nothing explains why.
 *
 * The taskbar button is the one people actually notice. Discord sets an AppUserModelID,
 * and Windows resolves a taskbar icon through the matching Start Menu shortcut rather
 * than through the running window - which is why setting `options.icon` on the
 * BrowserWindow is not enough on its own, and why the Start Menu entry matters most.
 *
 * This only ever runs when the installer's own icon file is present, so a dev inject or a
 * manual build never touches anyone's shortcuts, and it only ever writes the same icon
 * the installer already wrote with the user's consent. The installer keeps the backup
 * that uninstalling restores from; nothing here adds to or rewrites that record.
 */

function xbtcordFolder() {
    const local = process.env.LOCALAPPDATA;
    return local ? join(local, "Xbtcord") : null;
}

/** Discord*.lnk in a Start Menu folder, or in any one of its immediate subfolders. */
function startMenuShortcuts(programs: string): string[] {
    const found: string[] = [];
    if (!existsSync(programs)) return found;

    const isDiscordLink = (name: string) =>
        name.toLowerCase().startsWith("discord") && name.toLowerCase().endsWith(".lnk");

    for (const entry of readdirSync(programs)) {
        const full = join(programs, entry);

        try {
            if (statSync(full).isDirectory()) {
                // One level deep. Some Discord builds use a "Discord Inc" folder, others
                // drop the shortcut straight into Programs.
                for (const inner of readdirSync(full)) {
                    if (isDiscordLink(inner)) found.push(join(full, inner));
                }
            } else if (isDiscordLink(entry)) {
                found.push(full);
            }
        } catch {
            // A shortcut that vanished between the listing and the stat, or a folder we
            // cannot read. Neither is worth failing startup over.
        }
    }

    return found;
}

function candidates(): string[] {
    const paths: string[] = [];
    const { APPDATA, ProgramData, USERPROFILE, OneDrive } = process.env;

    if (APPDATA) {
        paths.push(...startMenuShortcuts(join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")));
        paths.push(join(APPDATA, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", "Discord.lnk"));
    }
    if (ProgramData) {
        paths.push(...startMenuShortcuts(join(ProgramData, "Microsoft", "Windows", "Start Menu", "Programs")));
    }
    if (USERPROFILE) paths.push(join(USERPROFILE, "Desktop", "Discord.lnk"));
    if (OneDrive) paths.push(join(OneDrive, "Desktop", "Discord.lnk"));

    return [...new Set(paths)].filter(existsSync);
}

export function reapplyShortcutIcons() {
    if (process.platform !== "win32") return;

    const folder = xbtcordFolder();
    if (!folder) return;

    // No icon file means this is not an installer-based install. Do nothing at all.
    const icon = join(folder, "xbtcord.ico");
    if (!existsSync(icon)) return;

    let changed = 0;

    for (const path of candidates()) {
        try {
            const link = shell.readShortcutLink(path);
            if (link.icon && link.icon.toLowerCase() === icon.toLowerCase()) continue;

            /*
             * "update" merges into the existing shortcut rather than replacing it, but
             * the details are passed back verbatim anyway so the target, arguments and
             * app id Discord set survive even if that behaviour ever changes. Only the
             * icon differs from what was read a moment ago.
             */
            if (shell.writeShortcutLink(path, "update", { ...link, icon, iconIndex: 0 })) changed++;
        } catch (err) {
            console.error("[Xbtcord] Couldn't restore the icon on", path, err);
        }
    }

    if (changed) console.log(`[Xbtcord] Put the icon back on ${changed} shortcut(s) after a Discord update`);
}
