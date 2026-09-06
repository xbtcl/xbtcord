/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    volume: {
        type: OptionType.SLIDER,
        description: "Volume every embedded video and audio clip starts at",
        markers: [0, 10, 25, 50, 75, 100],
        default: 40,
        stickToMarkers: false
    },
    remember: {
        type: OptionType.BOOLEAN,
        description: "Update the remembered volume whenever you change it on a clip",
        default: true
    },
    rememberMute: {
        type: OptionType.BOOLEAN,
        description: "Also remember whether you had it muted",
        default: false
    },
    muted: {
        type: OptionType.BOOLEAN,
        description: "Start muted",
        default: false,
        hidden: true
    }
});

/**
 * Elements we have already set, so the volume is applied once.
 *
 * Setting `volume` fires `volumechange`, which is the same event used to learn the user's
 * preference - without this guard the two chase each other. A WeakSet means a clip that
 * scrolls out of the message list gets collected normally.
 */
const initialised = new WeakSet<HTMLMediaElement>();

function isEmbedded(target: EventTarget | null): target is HTMLMediaElement {
    return target instanceof HTMLAudioElement || target instanceof HTMLVideoElement;
}

function onPlayOrLoad(event: Event) {
    const media = event.target;
    if (!isEmbedded(media) || initialised.has(media)) return;

    initialised.add(media);
    media.volume = Math.min(1, Math.max(0, settings.store.volume / 100));
    if (settings.store.rememberMute) media.muted = settings.store.muted;
}

function onVolumeChange(event: Event) {
    const media = event.target;
    if (!isEmbedded(media) || !settings.store.remember) return;

    // Only learn from changes the user made, not the one we just applied above.
    if (!initialised.has(media)) return;

    settings.store.volume = Math.round(media.volume * 100);
    if (settings.store.rememberMute) settings.store.muted = media.muted;
}

export default definePlugin({
    name: "MediaVolume",
    description: "Embedded videos and voice messages start at the volume you actually want, instead of full blast every time",
    tags: ["Media", "Accessibility", "Utility"],
    searchTerms: ["volume", "video", "audio", "loud", "media", "player"],
    authors: [Devs.Xbtcord],
    settings,

    start() {
        // Capture phase, on the window: media events don't bubble, so a listener on the
        // document body would never see them.
        window.addEventListener("loadedmetadata", onPlayOrLoad, true);
        window.addEventListener("play", onPlayOrLoad, true);
        window.addEventListener("volumechange", onVolumeChange, true);
    },

    stop() {
        window.removeEventListener("loadedmetadata", onPlayOrLoad, true);
        window.removeEventListener("play", onPlayOrLoad, true);
        window.removeEventListener("volumechange", onVolumeChange, true);
    }
});
