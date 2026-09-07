/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { FluxDispatcher, openModal, useEffect, useState } from "@webpack/common";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

import { Line, lineAt, parseLrc } from "./lrc";

const logger = new Logger("SpotifyLyrics");

const Native = XbtcordNative.pluginHelpers.SpotifyLyrics as PluginNative<typeof import("./native")> | undefined;
const CustomStatusSetting = getUserSettingLazy<any>("status", "customStatus")!;

/** Discord truncates a custom status past this, so there is no point sending more. */
const STATUS_LIMIT = 128;

const settings = definePluginSettings({
    emoji: {
        type: OptionType.STRING,
        description: "Emoji to show next to the lyric. Leave empty for none",
        default: "🎵"
    },
    minSeconds: {
        type: OptionType.NUMBER,
        description: "Never change the status more often than this. Below about 5 seconds you will get rate limited",
        default: 6
    },
    suffix: {
        type: OptionType.STRING,
        description: "Text to append, if it fits. {song} and {artist} are filled in",
        default: ""
    },
    clearWhenStopped: {
        type: OptionType.BOOLEAN,
        description: "Put your old status back when the music stops",
        default: true
    },
    skipUnsynced: {
        type: OptionType.BOOLEAN,
        description: "Only use transcriptions that carry timings. Off, an untimed one shows the song name instead",
        default: true
    }
});

interface Playing {
    id: string;
    name: string;
    artist: string;
    album: string;
    /** Milliseconds. */
    duration: number;
}

let current: Playing | null = null;
let lines: Line[] = [];
let status: "idle" | "loading" | "ready" | "none" = "idle";
let reason = "";

/*
 * Position is tracked the way SpotifyControls does it: Discord only tells us where the
 * playhead was when the state last changed, so the current position is that value plus
 * however long has passed since. Nothing polls Spotify.
 */
let positionAt = 0;
let positionStamp = 0;
let playing = false;

/** The status to put back. Captured the first time we overwrite it, not at plugin start. */
let previousStatus: any = null;
let haveOverwritten = false;
let lastWrite = 0;
let lastText = "";
let ticker: ReturnType<typeof setInterval> | undefined;

const listeners = new Set<() => void>();
const changed = () => { for (const listener of listeners) listener(); };

function position() {
    return playing ? positionAt + (Date.now() - positionStamp) : positionAt;
}

function writeStatus(text: string, emojiName: string) {
    try {
        CustomStatusSetting.updateSetting(text
            ? { text, emojiId: "0", emojiName, expiresAtMs: "0", createdAtMs: String(Date.now()) }
            : null);
    } catch (err) {
        logger.error("Could not set the status", err);
    }
}

function restore() {
    if (!haveOverwritten) return;
    haveOverwritten = false;

    try {
        CustomStatusSetting.updateSetting(previousStatus ?? null);
    } catch (err) {
        logger.error("Could not put your status back", err);
    }

    previousStatus = null;
    lastText = "";
}

async function load(track: Playing) {
    lines = [];
    status = "loading";
    reason = "";
    changed();

    if (!Native) {
        status = "none";
        reason = "Lyrics need the desktop client - the web build has no way to reach LRCLIB.";
        changed();
        return;
    }

    const result = await Native.fetchLyrics(track.name, track.artist, track.album, track.duration / 1000);

    // The song may have moved on while the request was in flight.
    if (current?.id !== track.id) return;

    if (!result.ok) {
        status = "none";
        reason = result.reason ?? "No lyrics found";
        changed();
        return;
    }

    if (result.synced) {
        lines = parseLrc(result.synced);
        status = lines.length ? "ready" : "none";
        if (!lines.length) reason = "The transcription had no usable timings";
    } else {
        status = "none";
        reason = settings.store.skipUnsynced
            ? "Only an untimed transcription exists for this one"
            : "Untimed transcription - showing the song instead";
    }

    changed();
}

function currentLine(): string {
    if (status === "ready") return lineAt(lines, position())?.text ?? "";
    if (status === "none" && !settings.store.skipUnsynced && current) return `${current.name} - ${current.artist}`;
    return "";
}

function tick() {
    if (!current || !playing) return;

    const line = currentLine();
    if (!line || line === lastText) return;

    const gap = Math.max(3, settings.store.minSeconds) * 1000;
    if (Date.now() - lastWrite < gap) return;

    let text = line;
    const suffix = settings.store.suffix
        .replaceAll("{song}", current.name)
        .replaceAll("{artist}", current.artist)
        .trim();

    if (suffix && text.length + suffix.length + 3 <= STATUS_LIMIT) text = `${text} - ${suffix}`;
    if (text.length > STATUS_LIMIT) text = text.slice(0, STATUS_LIMIT - 1) + "…";

    if (!haveOverwritten) {
        // Captured here rather than at start, so a status you set after enabling the
        // plugin is the one that comes back.
        try {
            previousStatus = CustomStatusSetting.getSetting();
        } catch {
            previousStatus = null;
        }
        haveOverwritten = true;
    }

    lastText = line;
    lastWrite = Date.now();
    writeStatus(text, settings.store.emoji.trim());
    changed();
}

function onPlayerState(event: any) {
    const track = event?.track;

    playing = !!event?.isPlaying;
    positionAt = event?.position ?? 0;
    positionStamp = Date.now();

    if (!track?.id) {
        current = null;
        lines = [];
        status = "idle";
        if (settings.store.clearWhenStopped) restore();
        changed();
        return;
    }

    if (current?.id === track.id) {
        // Same song, new position - a seek. The next tick picks the right line up.
        if (!playing && settings.store.clearWhenStopped) restore();
        changed();
        return;
    }

    current = {
        id: track.id,
        name: track.name ?? "",
        artist: track.artists?.map((a: any) => a.name).join(", ") ?? "",
        album: track.album?.name ?? "",
        duration: track.duration ?? 0
    };

    lastText = "";
    load(current).catch(err => logger.error("Could not load lyrics", err));
}

function LyricsModal(props: any) {
    const [, force] = useState(0);

    useEffect(() => {
        const listener = () => force(value => value + 1);
        listeners.add(listener);
        const handle = setInterval(listener, 1000);
        return () => {
            listeners.delete(listener);
            clearInterval(handle);
        };
    }, []);

    const active = status === "ready" ? lineAt(lines, position()) : null;

    return (
        <XbtModal props={props} title="Lyrics" subtitle={current ? `${current.name} - ${current.artist}` : undefined}>
            <div className="xbt-list">
                {current
                    ? (
                        <>
                            <Row
                                title={active?.text || (status === "ready" ? "(instrumental here)" : "Nothing to show")}
                                meta={status === "loading" ? "Looking it up..." : status === "ready"
                                    ? `${lines.length} lines, synced`
                                    : reason}
                            />
                            <Row
                                title={playing ? "Playing" : "Paused"}
                                meta={`${Math.floor(position() / 1000)}s of ${Math.round(current.duration / 1000)}s`}
                            />
                        </>
                    )
                    : <Empty>Nothing playing on Spotify.</Empty>
                }
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "SpotifyLyrics",
    description: "Sets your custom status to the line of the song playing on Spotify, in time with it",
    tags: ["Activity", "Fun", "Utility"],
    searchTerms: ["spotify", "lyrics", "status", "song", "music", "synced", "lrc"],
    authors: [Devs.Xbtcord],
    settings,

    /*
     * A word on rate limits, because this is the part that bites.
     *
     * Every status change is a request to Discord, and a synced transcription has a new
     * line every two or three seconds. Following it exactly would mean twenty-odd writes a
     * minute for as long as music is playing, which is enough to get the endpoint to start
     * refusing you - and enough to look like automation, which it is.
     *
     * So there is a floor on how often the status can change, defaulting to six seconds.
     * Lines that arrive inside that window are skipped rather than queued: showing the
     * line that is playing now matters more than showing every line.
     */
    toolboxActions: {
        "Lyrics": () => openModal(props => <LyricsModal {...props} />)
    },

    start() {
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
        ticker = setInterval(tick, 1000);
    },

    stop() {
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
        clearInterval(ticker);
        restore();

        current = null;
        lines = [];
        status = "idle";
        playing = false;
        listeners.clear();
    }
});
