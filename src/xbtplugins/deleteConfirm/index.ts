/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    holdShift: {
        type: OptionType.BOOLEAN,
        description: "Skip the confirmation while Shift is held, the way Discord already does",
        default: true
    },
    guardEscape: {
        type: OptionType.BOOLEAN,
        description: "Stop Escape closing a delete confirmation by accident",
        default: false
    }
});

/*
 * QuickDelete removes the confirmation. This is the opposite, for people who have deleted
 * the wrong message once too often.
 *
 * Discord already skips its own confirm when Shift is held, so the fix is not to add a
 * second dialog - it is to stop the Shift key reaching the delete handler unless you
 * actually meant it. A held Shift from scrolling or selecting text is the usual way a
 * message vanishes without warning.
 */
let heldShift = false;

function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Shift") heldShift = true;

    if (settings.store.guardEscape && event.key === "Escape" && document.querySelector('[role="dialog"] [class*="deleteMessage"]')) {
        event.stopPropagation();
    }
}

function onKeyUp(event: KeyboardEvent) {
    if (event.key === "Shift") heldShift = false;
}

/** Alt-tabbing away with Shift down would otherwise leave it stuck on. */
function clearShift() {
    heldShift = false;
}

/**
 * Intercepts the click on a delete menu item while Shift is down, unless the setting says
 * to honour it. Clicking the item itself still works - only the silent path is blocked.
 */
function onClickCapture(event: MouseEvent) {
    if (settings.store.holdShift || !heldShift) return;

    const target = (event.target as HTMLElement | null)?.closest?.('[id*="delete"]');
    if (!target) return;

    event.stopPropagation();
    event.preventDefault();

    // Re-dispatched without the modifier, so Discord shows the confirmation it would have
    // shown if Shift had not been down.
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: false }));
}

export default definePlugin({
    name: "DeleteConfirm",
    description: "Stops a held Shift key deleting messages without asking, which is how most accidental deletions happen",
    tags: ["Chat", "Utility", "Accessibility"],
    searchTerms: ["delete", "confirm", "accident", "shift", "undo", "safety"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", clearShift, true);
        document.addEventListener("click", onClickCapture, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("keyup", onKeyUp, true);
        window.removeEventListener("blur", clearShift, true);
        document.removeEventListener("click", onClickCapture, true);
        heldShift = false;
    }
});
