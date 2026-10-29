/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * The English half of endcord's translation layer, and nothing more.
 *
 * Plugins ported from endcord wrap their strings in t(), and endcord resolves those through
 * a 22,000 line dictionary in five languages that also hooks into settings, toasts and the
 * Discord locale. Xbtcord ships in English, and in English every key is the text itself - so
 * this keeps the same call signature and the same {placeholder} substitution, and leaves the
 * dictionary out. A ported plugin reads exactly as it does upstream with the language set to
 * English, without pulling a translation system into a fork that does not use one.
 */

export type XbtcordLang = "en";

export function t(key: string, vars?: Record<string, string | number>): string {
    let result = key;

    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            result = result.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
        }
    }

    return result;
}

export function tPluginDesc(_pluginName: string, fallbackDescription: string): string {
    return fallbackDescription;
}

export function useI18n() {
    return {
        lang: "en" as XbtcordLang,
        t,
        tPluginDesc,
        setLanguage: (_lang: XbtcordLang) => { }
    };
}
