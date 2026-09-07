/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, showToast, Toasts } from "@webpack/common";

const logger = new Logger("AutoJoinVoice");

const settings = definePluginSettings({
    channelId: {
        type: OptionType.STRING,
        description: "The voice channel to join. Right click one with developer mode on and copy its id",
        default: ""
    },
    delaySeconds: {
        type: OptionType.NUMBER,
        description: "Wait this long after startup before joining, so the connection has settled",
        default: 10
    },
    muted: {
        type: OptionType.BOOLEAN,
        description: "Join muted",
        default: true
    },
    deafened: {
        type: OptionType.BOOLEAN,
        description: "Join deafened",
        default: false
    }
});

let handle: ReturnType<typeof setTimeout> | undefined;

function join() {
    const channelId = settings.store.channelId.trim();
    if (!channelId) return;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) {
        logger.warn("No channel with that id is loaded - not joining");
        return;
    }

    /*
     * Voice channels are types 2 and 13. Dispatching a voice connect for a text channel
     * puts the client into a state it does not recover from cleanly, so the check is not
     * optional.
     */
    if (channel.type !== 2 && channel.type !== 13) {
        showToast("AutoJoinVoice: that id is not a voice channel", Toasts.Type.FAILURE);
        return;
    }

    try {
        FluxDispatcher.dispatch({
            type: "VOICE_CHANNEL_SELECT",
            channelId,
            guildId: channel.guild_id ?? null
        } as any);

        if (settings.store.muted) {
            FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_MUTE" } as any);
        }
        if (settings.store.deafened) {
            FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF" } as any);
        }
    } catch (err) {
        logger.error("Could not join", err);
    }
}

export default definePlugin({
    name: "AutoJoinVoice",
    description: "Drops you into one voice channel a few seconds after Discord starts, muted unless you say otherwise",
    tags: ["Voice", "Utility"],
    searchTerms: ["voice", "join", "auto", "startup", "vc", "connect"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        if (!settings.store.channelId.trim()) return;
        handle = setTimeout(join, Math.max(0, settings.store.delaySeconds) * 1000);
    },

    stop() {
        clearTimeout(handle);
    }
});
