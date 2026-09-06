/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { DraftType, showToast, Toasts, UploadHandler } from "@webpack/common";

const logger = new Logger("PasteAsFile");

const settings = definePluginSettings({
    threshold: {
        type: OptionType.NUMBER,
        description: "Paste longer than this many characters becomes a file",
        default: 1800
    },
    filename: {
        type: OptionType.STRING,
        description: "What to call the file",
        default: "message.txt"
    }
});

/**
 * Turns an oversized paste into an attachment.
 *
 * Discord's own answer to a long paste is to refuse it at 2000 characters and leave you to
 * work out what to cut. The threshold defaults slightly under that, so this takes over
 * before the refusal rather than after it.
 */
function onPaste(event: ClipboardEvent) {
    try {
        const text = event.clipboardData?.getData("text/plain");
        if (!text || text.length < Math.max(1, settings.store.threshold)) return;

        // Files pasted alongside text are Discord's business, not ours.
        if (event.clipboardData?.files?.length) return;

        const target = event.target as HTMLElement | null;
        if (!target?.closest?.("[class*=slateTextArea], [role=textbox]")) return;

        const channel = getCurrentChannel();
        if (!channel) return;

        event.preventDefault();
        event.stopPropagation();

        const name = settings.store.filename.trim() || "message.txt";
        const file = new File([text], name, { type: "text/plain" });

        UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage);
        showToast(`Pasted ${text.length} characters as ${name}`, Toasts.Type.SUCCESS);
    } catch (err) {
        logger.error("Couldn't turn the paste into a file", err);
    }
}

export default definePlugin({
    name: "PasteAsFile",
    description: "Turns a paste that is too long to send into a text file attachment",
    tags: ["Chat", "Utility"],
    searchTerms: ["paste", "file", "long", "txt", "attachment", "2000"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        document.addEventListener("paste", onPaste, true);
    },

    stop() {
        document.removeEventListener("paste", onPaste, true);
    }
});
