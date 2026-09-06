/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginMeta } from "~plugins";

/**
 * Which project a plugin came from.
 *
 * This is decided by which directory the plugin lives in, which the build records in
 * `PluginMeta.folderName`. That is the only honest signal available: everything inherited
 * from upstream sits together in `src/plugins`, so there is no way to tell a plugin
 * Vencord wrote from one endcord added later. Rather than guess, upstream is upstream.
 */
export const enum PluginSource {
    /** Written for this fork, in `src/xbtplugins`. */
    Xbtcord = "xbtcord",
    /** Inherited from upstream, in `src/plugins`. */
    Upstream = "upstream",
    /** Dropped in by the user, in `src/userplugins`. */
    User = "user"
}

export const SourceLabels: Record<PluginSource, string> = {
    [PluginSource.Xbtcord]: "Xbtcord",
    [PluginSource.Upstream]: "Upstream",
    [PluginSource.User]: "User"
};

/** Badge colours, picked to read against both the light and dark card backgrounds. */
export const SourceColors: Record<PluginSource, string> = {
    [PluginSource.Xbtcord]: "#a78bfa",
    [PluginSource.Upstream]: "#5865F2",
    [PluginSource.User]: "#3ba55d"
};

export function getPluginSource(name: string): PluginSource {
    const meta = PluginMeta[name];
    if (!meta) return PluginSource.Upstream;
    if (meta.userPlugin) return PluginSource.User;

    // The build strips a leading `src/plugins/`, so anything still carrying a full path
    // came from one of the other directories.
    return meta.folderName?.startsWith("src/xbtplugins/")
        ? PluginSource.Xbtcord
        : PluginSource.Upstream;
}
