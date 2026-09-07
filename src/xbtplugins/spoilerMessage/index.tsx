/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { ImageInvisible, ImageVisible } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

const settings = definePluginSettings({
    perMessage: {
        type: OptionType.BOOLEAN,
        description: "Turn itself off again after one message",
        default: true
    }
});

/*
 * The flag lives outside React because onBeforeMessageSend has to read it and has no
 * component to read it from. The button subscribes so that a send which disarms the
 * toggle updates the icon straight away.
 */
let armed = false;
const listeners = new Set<(value: boolean) => void>();

function setArmed(value: boolean) {
    armed = value;
    for (const listener of listeners) listener(value);
}

const renderButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const [active, setActive] = useState(armed);

    useEffect(() => {
        listeners.add(setActive);
        return () => void listeners.delete(setActive);
    }, []);

    if (!isMainChat) return null;

    return (
        <ChatBarButton
            tooltip={active ? "Spoiler is on - the next message will be hidden" : "Send the next message as a spoiler"}
            onClick={() => setArmed(!armed)}
            buttonProps={{ style: active ? { color: "var(--brand-500, #5865f2)" } : undefined }}
        >
            {active ? <ImageInvisible /> : <ImageVisible />}
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "SpoilerMessage",
    description: "A chat bar toggle that wraps your next message in spoiler bars",
    tags: ["Chat", "Utility"],
    searchTerms: ["spoiler", "hide", "blur", "cw", "content warning"],
    authors: [Devs.Xbtcord],
    settings,

    chatBarButton: {
        render: renderButton,
        icon: ImageInvisible
    },

    onBeforeMessageSend(_channelId, message) {
        if (!armed) return;

        /*
         * Spoilers are inline markup, so a message that already contains bars would end
         * up with them nested and half the text still showing. Stripping the existing
         * ones first is the only way to get one clean spoiler out of it.
         */
        if (message.content) message.content = `||${message.content.replaceAll("||", "")}||`;

        if (settings.store.perMessage) setArmed(false);
    },

    stop() {
        setArmed(false);
        listeners.clear();
    }
});
