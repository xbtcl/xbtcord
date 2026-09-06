/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VENCORD_PLUGINS } from "@utils/pluginOrigins";
import { ENDCORD_LOGO, EQUICORD_LOGO, VENCORD_LOGO } from "@utils/pluginSourceLogos";
import { XBTCORD_ICON } from "@utils/xbtcordLogo";

import { PluginMeta } from "~plugins";

/**
 * Which project a plugin came from.
 *
 * Two signals feed this. The directory a plugin lives in settles most of it, because the
 * build records that in `PluginMeta.folderName`. But everything inherited from upstream
 * sits together in `src/plugins`, so telling a Vencord plugin from one endcord added on
 * top needs the second signal: a recorded snapshot of Vencord's own plugin directory.
 */
export const enum PluginSource {
    /** Written for this fork, in `src/xbtplugins`. */
    Xbtcord = "xbtcord",
    /** Imported from Equicord, in `src/equicordplugins`. */
    Equicord = "equicord",
    /** From Vencord, the root of this whole family tree. */
    Vencord = "vencord",
    /** In `src/plugins` but not Vencord's, so endcord added it. */
    Endcord = "endcord",
    /** Dropped in by the user, in `src/userplugins`. */
    User = "user"
}

export const SourceLabels: Record<PluginSource, string> = {
    [PluginSource.Xbtcord]: "Xbtcord",
    [PluginSource.Equicord]: "Equicord",
    [PluginSource.Vencord]: "Vencord",
    [PluginSource.Endcord]: "Endcord",
    [PluginSource.User]: "User"
};

/** Badge colours, each project's own where it has one. */
export const SourceColors: Record<PluginSource, string> = {
    [PluginSource.Xbtcord]: "#a78bfa",
    [PluginSource.Equicord]: "#e78284",
    [PluginSource.Vencord]: "#5865F2",
    [PluginSource.Endcord]: "#38bdf8",
    [PluginSource.User]: "#3ba55d"
};

/**
 * Each project's own logo. User plugins have nobody's logo to show, so they keep the
 * text badge - there is no mark for "yours".
 */
export const SourceLogos: Record<PluginSource, string | null> = {
    [PluginSource.Xbtcord]: XBTCORD_ICON,
    [PluginSource.Equicord]: EQUICORD_LOGO,
    [PluginSource.Vencord]: VENCORD_LOGO,
    [PluginSource.Endcord]: ENDCORD_LOGO,
    [PluginSource.User]: null
};

/** What the badge says on hover. */
export const SourceTooltips: Record<PluginSource, string> = {
    [PluginSource.Xbtcord]: "Xbtcord plugin",
    [PluginSource.Equicord]: "Equicord plugin",
    [PluginSource.Vencord]: "Vencord plugin",
    [PluginSource.Endcord]: "Endcord plugin",
    [PluginSource.User]: "Your own plugin"
};

export function getPluginSource(name: string): PluginSource {
    const meta = PluginMeta[name];
    if (!meta) return PluginSource.Vencord;
    if (meta.userPlugin) return PluginSource.User;

    const folder = meta.folderName ?? "";

    // The build strips a leading `src/plugins/`, so anything still carrying a full path
    // came from one of the other directories.
    if (folder.startsWith("src/xbtplugins/")) return PluginSource.Xbtcord;
    if (folder.startsWith("src/equicordplugins/")) return PluginSource.Equicord;

    // Left in `src/plugins`, so it is upstream - the question is whose.
    return VENCORD_PLUGINS.has(folder) ? PluginSource.Vencord : PluginSource.Endcord;
}
