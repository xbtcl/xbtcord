/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { ChannelStore, GuildStore, Menu, Modal, openModal, Text, UserStore } from "@webpack/common";
import { User } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { jumpToMessage } from "@xbtplugins/_shared/util";

const logger = new Logger("FriendVoiceAlerts");

interface Watched {
    id: string;
    username: string;
}

const watched = new PersistedRecord<Watched>("Xbtcord_FriendVoiceAlerts");

const settings = definePluginSettings({
    ignoreWhenBusy: {
        type: OptionType.BOOLEAN,
        description: "Stay quiet while you are already in a voice channel",
        default: true
    },
    onlyWhenAlone: {
        type: OptionType.BOOLEAN,
        description: "Only tell me when they are the first one in the channel",
        default: false
    }
});

const SpeakerIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" width={width} height={height} className={className} fill="currentColor" aria-hidden="true">
        <path d="M11.4 3.2a1 1 0 0 1 .6.92v15.76a1 1 0 0 1-1.65.76L5.6 16.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h2.6l4.75-4.14a1 1 0 0 1 1.05-.16ZM16.5 8.2a1 1 0 0 1 1.4.2 6 6 0 0 1 0 7.2 1 1 0 1 1-1.6-1.2 4 4 0 0 0 0-4.8 1 1 0 0 1 .2-1.4Z" />
    </svg>
);

/**
 * Who we last saw where.
 *
 * VOICE_STATE_UPDATES fires for far more than joins - mutes, deafens, video, screenshare
 * and plain resyncs all arrive as a state for the same channel. Without remembering the
 * previous channel, muting yourself in a call would read as a fresh join every time.
 */
const lastChannel = new Map<string, string | null>();

function inVoice(): boolean {
    const me = UserStore.getCurrentUser();
    if (!me) return false;
    return lastChannel.get(me.id) != null;
}

function WatchList() {
    const all = watched.use();
    const rows = Object.values(all).sort((a, b) => a.username.localeCompare(b.username));

    if (!rows.length) {
        return <div className="xbt-empty">Nobody watched yet. Right-click someone and pick <b>Alert me in voice</b>.</div>;
    }

    return (
        <div className="xbt-list">
            {rows.map(entry => (
                <div className="xbt-row" key={entry.id}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{entry.username}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">{entry.id}</Text>
                    </div>
                    <div className="xbt-row-actions">
                        <Button size="small" variant="dangerSecondary" onClick={() => watched.delete(entry.id)}>
                            Stop watching
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function openWatchList() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Voice alerts"
                subtitle="People you want to hear about when they hop in a call"
                size="sm"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <WatchList />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "FriendVoiceAlerts",
    description: "Get a notification when the people you pick join a voice channel",
    tags: ["Voice", "Notifications", "Friends"],
    searchTerms: ["voice", "alert", "notify", "friend", "join", "call"],
    authors: [Devs.Xbtcord],
    settings,

    contextMenus: {
        "user-context": (children, { user }: { user?: User; }) => {
            if (!user) return;
            const isWatched = watched.has(user.id);

            children.push(
                <Menu.MenuItem
                    id="xbt-voice-alert"
                    label={isWatched ? "Stop voice alerts" : "Alert me in voice"}
                    icon={SpeakerIcon}
                    action={() => {
                        if (isWatched) watched.delete(user.id);
                        else watched.set(user.id, { id: user.id, username: user.username });
                    }}
                />
            );
        }
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            try {
                for (const state of voiceStates ?? []) {
                    const userId = state.userId ?? state.user_id;
                    if (!userId) continue;

                    const channelId: string | null = state.channelId ?? state.channel_id ?? null;
                    const previous = lastChannel.get(userId) ?? null;
                    lastChannel.set(userId, channelId);

                    if (!channelId || channelId === previous) continue;
                    if (!watched.has(userId)) continue;
                    if (settings.store.ignoreWhenBusy && inVoice()) continue;

                    const channel = ChannelStore.getChannel(channelId);
                    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
                    const user = UserStore.getUser(userId);

                    if (settings.store.onlyWhenAlone) {
                        const others = voiceStates.filter(s => (s.channelId ?? s.channel_id) === channelId).length;
                        if (others > 1) continue;
                    }

                    showNotification({
                        title: `${user?.username ?? watched.get(userId)?.username ?? "Someone"} joined voice`,
                        body: `${channel?.name ?? "a voice channel"}${guild ? ` in ${guild.name}` : ""}`,
                        icon: user?.getAvatarURL?.(undefined, 128),
                        onClick: () => jumpToMessage(channelId)
                    });
                }
            } catch (err) {
                logger.error("Failed to handle a voice update", err);
            }
        }
    },

    toolboxActions: {
        "Voice alerts": openWatchList
    },

    async start() {
        await watched.load();
    },

    stop() {
        lastChannel.clear();
    }
});
