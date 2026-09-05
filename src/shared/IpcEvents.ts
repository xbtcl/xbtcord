/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const enum IpcEvents {
    INIT_FILE_WATCHERS = "XbtcordInitFileWatchers",

    OPEN_QUICKCSS = "XbtcordOpenQuickCss",
    GET_QUICK_CSS = "XbtcordGetQuickCss",
    SET_QUICK_CSS = "XbtcordSetQuickCss",
    QUICK_CSS_UPDATE = "XbtcordQuickCssUpdate",

    GET_SETTINGS = "XbtcordGetSettings",
    SET_SETTINGS = "XbtcordSetSettings",

    GET_THEMES_LIST = "XbtcordGetThemesList",
    GET_THEME_DATA = "XbtcordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "XbtcordGetThemeSystemValues",
    THEME_UPDATE = "XbtcordThemeUpdate",

    OPEN_EXTERNAL = "XbtcordOpenExternal",
    OPEN_THEMES_FOLDER = "XbtcordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "XbtcordOpenSettingsFolder",

    GET_UPDATES = "XbtcordGetUpdates",
    GET_REPO = "XbtcordGetRepo",
    UPDATE = "XbtcordUpdate",
    BUILD = "XbtcordBuild",

    OPEN_MONACO_EDITOR = "XbtcordOpenMonacoEditor",
    GET_MONACO_THEME = "XbtcordGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "XbtcordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "XbtcordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "XbtcordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "XbtcordCspRequestAddOverride",

    GET_RENDERER_CSS = "XbtcordGetRendererCss",
    RENDERER_CSS_UPDATE = "XbtcordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "XbtcordPreloadGetRendererJs",

    SUPPORTS_WINDOWS_MATERIAL = "XbtcordSupportsWindowsMaterial",
}
