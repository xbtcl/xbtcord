/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getCurrentChannel } from "@utils/discord";
import { MessageStore, useMemo, useState } from "@webpack/common";

export interface ChatMedia {
    url: string;
    /** A still to show in the grid. Videos have a poster, images are their own. */
    thumbnail: string;
    filename: string;
    kind: "image" | "video";
    author: string;
    at: number;
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i;
const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function nameFrom(url: string, fallback: string) {
    try {
        const path = new URL(url).pathname;
        return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || fallback;
    } catch {
        return fallback;
    }
}

/**
 * Everything in this channel that could become a GIF, newest first.
 *
 * Read straight out of MessageStore, which holds what the client has already loaded for
 * the channel - so this needs no request, cannot be rate limited, and shows exactly what
 * you can currently scroll back through. Nothing is fetched until you pick one.
 */
export function collectMedia(channelId: string, limit = 60): ChatMedia[] {
    const messages = (MessageStore.getMessages(channelId) as any)?.toArray?.() ?? [];
    const found: ChatMedia[] = [];
    const seen = new Set<string>();

    for (let i = messages.length - 1; i >= 0 && found.length < limit; i--) {
        const message = messages[i];
        const author = message?.author?.username ?? "someone";
        const at = new Date(message?.timestamp ?? Date.now()).getTime();

        const push = (media: Omit<ChatMedia, "author" | "at">) => {
            if (seen.has(media.url)) return;
            seen.add(media.url);
            found.push({ ...media, author, at });
        };

        for (const attachment of message?.attachments ?? []) {
            const type = attachment.content_type ?? "";
            const isVideo = type.startsWith("video/") || VIDEO_EXTENSION.test(attachment.filename ?? "");
            const isImage = type.startsWith("image/") || IMAGE_EXTENSION.test(attachment.filename ?? "");
            if (!isVideo && !isImage) continue;

            push({
                url: attachment.url,
                // Discord gives videos a generated poster; images stand in for themselves.
                thumbnail: isVideo ? (attachment.proxy_url ? `${attachment.proxy_url}?format=jpeg` : "") : (attachment.proxy_url ?? attachment.url),
                filename: attachment.filename ?? nameFrom(attachment.url, "attachment"),
                kind: isVideo ? "video" : "image"
            });
        }

        for (const embed of message?.embeds ?? []) {
            const image = embed?.image ?? embed?.thumbnail;
            const video = embed?.video;

            if (video?.url && VIDEO_EXTENSION.test(video.url)) {
                push({
                    url: video.url,
                    thumbnail: image?.proxyURL ?? image?.url ?? "",
                    filename: nameFrom(video.url, "video.mp4"),
                    kind: "video"
                });
            } else if (image?.url) {
                push({
                    url: image.url,
                    thumbnail: image.proxyURL ?? image.url,
                    filename: nameFrom(image.url, "image.png"),
                    kind: "image"
                });
            }
        }
    }

    return found;
}

/** Downloads one of them so it can be handed to the converter as a file. */
export async function toFile(media: ChatMedia): Promise<File> {
    const response = await fetch(media.url);
    if (!response.ok) throw new Error(`The CDN answered ${response.status}`);

    const blob = await response.blob();
    return new File([blob], media.filename, { type: blob.type || (media.kind === "video" ? "video/mp4" : "image/png") });
}

export function ChatImagePicker({ onPick, onCancel }: { onPick: (media: ChatMedia) => void; onCancel: () => void; }) {
    const channel = getCurrentChannel();
    const media = useMemo(() => channel ? collectMedia(channel.id) : [], [channel?.id]);
    const [filter, setFilter] = useState<"all" | "image" | "video">("all");

    const shown = media.filter(item => filter === "all" || item.kind === filter);

    return (
        <div className="i2g-picker">
            <div className="i2g-picker-head">
                <div className="i2g-chips">
                    {(["all", "image", "video"] as const).map(value => (
                        <button
                            key={value}
                            className={`i2g-chip${filter === value ? " i2g-chip-active" : ""}`}
                            onClick={() => setFilter(value)}
                        >
                            {value === "all" ? "Everything" : value === "image" ? "Images" : "Videos"}
                        </button>
                    ))}
                </div>
                <button className="i2g-chip" onClick={onCancel}>Back</button>
            </div>

            {shown.length
                ? (
                    <div className="i2g-picker-grid">
                        {shown.map(item => (
                            <button
                                key={item.url}
                                className="i2g-picker-tile"
                                title={`${item.filename} - ${item.author}`}
                                onClick={() => onPick(item)}
                            >
                                {item.thumbnail
                                    ? <img src={item.thumbnail} alt="" loading="lazy" />
                                    : <div className="i2g-picker-blank">{item.kind}</div>}
                                {item.kind === "video" && <span className="i2g-picker-badge">video</span>}
                            </button>
                        ))}
                    </div>
                )
                : (
                    <div className="i2g-picker-empty">
                        Nothing loaded in this channel yet. Scroll back through it and try again.
                    </div>
                )
            }
        </div>
    );
}
