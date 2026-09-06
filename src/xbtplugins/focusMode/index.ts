/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import managedStyle from "./styles.css?managed";

const logger = new Logger("FocusMode");

const StatusSetting = getUserSettingLazy<string>("status", "status")!;

const settings = definePluginSettings({
    hideMembers: {
        type: OptionType.BOOLEAN,
        description: "Hide the member list",
        default: true
    },
    hideServers: {
        type: OptionType.BOOLEAN,
        description: "Hide the server rail on the left",
        default: false
    },
    hideChannels: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel sidebar",
        default: false
    },
    quietNotifications: {
        type: OptionType.BOOLEAN,
        description: "Hide in-app notification popups",
        default: true
    },
    greyAvatars: {
        type: OptionType.BOOLEAN,
        description: "Drain the colour out of avatars",
        default: false
    },
    blurMedia: {
        type: OptionType.BOOLEAN,
        description: "Blur images and video until you hover them",
        default: false
    },
    setDoNotDisturb: {
        type: OptionType.BOOLEAN,
        description: "Also switch you to Do Not Disturb, and back afterwards",
        default: false
    }
});

let active = false;
let previousStatus: string | null = null;

const CLASSES: [keyof typeof settings.store, string][] = [
    ["hideMembers", "xbt-focus-members"],
    ["hideServers", "xbt-focus-servers"],
    ["hideChannels", "xbt-focus-channels"],
    ["quietNotifications", "xbt-focus-quiet"],
    ["greyAvatars", "xbt-focus-avatars"],
    ["blurMedia", "xbt-focus-media"]
];

function applyClasses() {
    for (const [key, className] of CLASSES) {
        document.body.classList.toggle(className, active && !!settings.store[key]);
    }
}

export function setFocus(on: boolean) {
    if (on === active) return;
    active = on;
    applyClasses();

    if (settings.store.setDoNotDisturb) {
        try {
            if (on) {
                // Remembered so turning focus off puts you back where you were, rather
                // than leaving you on Do Not Disturb and wondering why nobody pings.
                previousStatus = StatusSetting.getSetting() ?? "online";
                StatusSetting.updateSetting("dnd");
            } else if (previousStatus) {
                StatusSetting.updateSetting(previousStatus);
                previousStatus = null;
            }
        } catch (err) {
            logger.error("Couldn't change your status", err);
        }
    }

    showToast(on ? "Focus mode on" : "Focus mode off", Toasts.Type.SUCCESS);
}

export default definePlugin({
    name: "FocusMode",
    description: "One switch that strips Discord back to the conversation in front of you",
    tags: ["Accessibility", "Appearance", "Utility"],
    searchTerms: ["focus", "zen", "distraction", "quiet", "minimal"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI", "UserSettingsAPI"],
    settings,
    managedStyle,

    commands: [
        {
            name: "focus",
            description: "Toggle focus mode",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute() {
                setFocus(!active);
            }
        }
    ],

    toolboxActions: {
        "Toggle focus mode": () => setFocus(!active)
    },

    stop() {
        setFocus(false);
        // setFocus is a no-op if it was already off, so the classes are cleared directly.
        active = false;
        applyClasses();
    }
});
