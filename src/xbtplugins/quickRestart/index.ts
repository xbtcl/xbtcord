/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import { relaunch } from "@utils/native";
import definePlugin from "@utils/types";
import { Alerts } from "@webpack/common";

/**
 * Restarting is the single most common thing this fork asks you to do - most plugins with
 * patches need one - and the only routes to it are the notice bar that appears after a
 * toggle, or quitting from the tray. This puts it one click away from anywhere.
 */
function restart() {
    Alerts.show({
        title: "Restart Discord?",
        body: "Anything you have typed and not sent will be lost.",
        confirmText: "Restart",
        cancelText: "Stay",
        onConfirm: relaunch
    });
}

export default definePlugin({
    name: "QuickRestart",
    description: "Adds a restart button to the Xbtcord toolbox, for the many times a plugin asks for one",
    tags: ["Utility", "Shortcuts"],
    searchTerms: ["restart", "reload", "relaunch", "quit"],
    authors: [Devs.Xbtcord],

    toolboxActions: {
        "Restart Discord": restart
    }
});
