/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { popNotice, showNotice } from "@api/Notices";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    seconds: {
        type: OptionType.SLIDER,
        description: "How long to hold a message before it actually sends",
        markers: [2, 3, 5, 8, 10],
        default: 5,
        stickToMarkers: false
    },
    skipShortMessages: {
        type: OptionType.BOOLEAN,
        description: "Send messages under 10 characters straight away",
        default: true
    }
});

export default definePlugin({
    name: "UndoSend",
    description: "Holds your message for a few seconds so you can take it back before it lands",
    tags: ["Chat", "Utility"],
    searchTerms: ["undo", "unsend", "delay", "recall", "oops"],
    authors: [Devs.Xbtcord],
    settings,

    /**
     * Holds the send by simply not resolving yet.
     *
     * The send pipeline awaits this listener, so the message genuinely has not been handed
     * to Discord while the notice is up - which is the difference between taking it back
     * and deleting it after everyone saw it.
     */
    async onBeforeMessageSend(_channelId, message) {
        const delay = Math.max(0, settings.store.seconds) * 1000;
        if (!delay) return;
        if (settings.store.skipShortMessages && message.content.trim().length < 10) return;

        const cancelled = await new Promise<boolean>(resolve => {
            let settled = false;

            const finish = (value: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                popNotice();
                resolve(value);
            };

            const timer = setTimeout(() => finish(false), delay);

            showNotice(
                `Sending in ${Math.round(delay / 1000)}s…`,
                "Undo",
                () => finish(true)
            );
        });

        if (cancelled) return { cancel: true };
    }
});
