/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, RelationshipStore, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

const logger = new Logger("PingSounds");

const TONES = {
    chime: [880, 1320],
    knock: [220, 165],
    blip: [1200],
    rise: [440, 660, 880]
} as const;

type ToneName = keyof typeof TONES;

const settings = definePluginSettings({
    onMention: {
        type: OptionType.SELECT,
        description: "Sound when someone mentions you directly",
        default: "chime",
        options: [
            { label: "Chime", value: "chime", default: true },
            { label: "Knock", value: "knock" },
            { label: "Blip", value: "blip" },
            { label: "Rise", value: "rise" },
            { label: "Nothing", value: "none" }
        ]
    },
    onDm: {
        type: OptionType.SELECT,
        description: "Sound for a direct message",
        default: "knock",
        options: [
            { label: "Chime", value: "chime" },
            { label: "Knock", value: "knock", default: true },
            { label: "Blip", value: "blip" },
            { label: "Rise", value: "rise" },
            { label: "Nothing", value: "none" }
        ]
    },
    keywords: {
        type: OptionType.STRING,
        description: "Extra words that should make a noise, comma separated",
        default: ""
    },
    onKeyword: {
        type: OptionType.SELECT,
        description: "Sound for one of those words",
        default: "rise",
        options: [
            { label: "Chime", value: "chime" },
            { label: "Knock", value: "knock" },
            { label: "Blip", value: "blip" },
            { label: "Rise", value: "rise", default: true },
            { label: "Nothing", value: "none" }
        ]
    },
    volume: {
        type: OptionType.SLIDER,
        description: "How loud",
        markers: [0, 25, 50, 75, 100],
        default: 40,
        stickToMarkers: false
    },
    friendsOnly: {
        type: OptionType.BOOLEAN,
        description: "Only make a noise for friends",
        default: false
    }
});

/*
 * The tones are synthesised rather than loaded.
 *
 * Sound files would have to come from somewhere, and Discord blocks fetches to anywhere
 * that is not on its own allow list - the same wall that stops the other plugins reaching
 * an outside service. Two oscillator notes through a gain envelope need no file, no
 * network and no permission, and are perfectly distinguishable from each other, which is
 * the entire point of having more than one.
 */
let audio: AudioContext | undefined;

function play(tone: ToneName) {
    const volume = Math.max(0, Math.min(100, settings.store.volume)) / 100;
    if (!volume) return;

    try {
        audio ??= new AudioContext();
        if (audio.state === "suspended") audio.resume();

        const notes = TONES[tone];
        const now = audio.currentTime;

        notes.forEach((frequency, index) => {
            const oscillator = audio!.createOscillator();
            const gain = audio!.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            const start = now + index * 0.09;
            // A short attack and a quick decay - a square-edged tone clicks, and a long
            // tail turns a busy channel into a drone.
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume * 0.25, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

            oscillator.connect(gain).connect(audio!.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.25);
        });
    } catch (err) {
        logger.warn("Could not play a tone", err);
    }
}

function keywordHit(content: string) {
    const words = settings.store.keywords.split(",").map(word => word.trim().toLowerCase()).filter(Boolean);
    if (!words.length) return false;

    const haystack = content.toLowerCase();
    return words.some(word => haystack.includes(word));
}

export default definePlugin({
    name: "PingSounds",
    description: "Gives mentions, DMs and your own keywords each their own sound, so you know what happened without looking",
    tags: ["Notifications", "Utility", "Accessibility"],
    searchTerms: ["sound", "ping", "alert", "notification", "audio", "keyword", "tone"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (optimistic || !message?.id) return;

            const me = UserStore.getCurrentUser()?.id;
            const authorId = message.author?.id;
            if (!me || !authorId || authorId === me || message.author?.bot) return;
            if (settings.store.friendsOnly && !RelationshipStore.isFriend(authorId)) return;

            const content = message.content ?? "";
            const mentioned = message.mentions?.some((mention: any) =>
                (typeof mention === "string" ? mention : mention?.id) === me);

            if (mentioned && settings.store.onMention !== "none") {
                play(settings.store.onMention as ToneName);
                return;
            }

            const channel = ChannelStore.getChannel(message.channel_id);
            if (channel && !channel.guild_id && settings.store.onDm !== "none") {
                play(settings.store.onDm as ToneName);
                return;
            }

            if (keywordHit(content) && settings.store.onKeyword !== "none") {
                play(settings.store.onKeyword as ToneName);
            }
        }
    },

    stop() {
        audio?.close().catch(() => { /* already closed */ });
        audio = undefined;
    }
});
