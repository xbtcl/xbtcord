/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { Message } from "@xbtcord/discord-types";

const settings = definePluginSettings({
    showDimensions: {
        type: OptionType.BOOLEAN,
        description: "Show pixel dimensions",
        default: true
    },
    showSize: {
        type: OptionType.BOOLEAN,
        description: "Show file size",
        default: true
    },
    showType: {
        type: OptionType.BOOLEAN,
        description: "Show the file type",
        default: false
    }
});

/** Bytes at three significant figures, which is as much as anyone reads. */
function formatBytes(bytes: number): string {
    if (!bytes || bytes < 0) return "";
    const units = ["B", "KB", "MB", "GB"];

    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function describe(attachment: any): string {
    const parts: string[] = [];

    if (settings.store.showDimensions && attachment.width && attachment.height) {
        parts.push(`${attachment.width}×${attachment.height}`);
    }
    if (settings.store.showSize && attachment.size) {
        parts.push(formatBytes(attachment.size));
    }
    if (settings.store.showType && attachment.content_type) {
        parts.push(attachment.content_type.split("/")[1]?.toUpperCase() ?? attachment.content_type);
    }

    return parts.join(" · ");
}

function MediaInfoRow({ message }: { message: Message; }) {
    const attachments = (message.attachments ?? []) as any[];
    if (!attachments.length) return null;

    const rows = attachments
        .map(attachment => ({ attachment, text: describe(attachment) }))
        .filter(row => row.text);

    if (!rows.length) return null;

    return (
        <div className="xbt-media-info">
            {rows.map(({ attachment, text }) => (
                <span
                    key={attachment.id ?? attachment.url}
                    className="xbt-media-info-item"
                    title={`${attachment.filename ?? "attachment"} — click to copy the name`}
                    onClick={() => copyWithToast(attachment.filename ?? attachment.url, "Filename copied")}
                >
                    {text}
                </span>
            ))}
        </div>
    );
}

export default definePlugin({
    name: "MediaInfo",
    description: "Shows the size and dimensions of attachments, without opening them",
    tags: ["Media", "Utility"],
    searchTerms: ["media", "image", "size", "dimensions", "resolution", "attachment", "file"],
    authors: [Devs.Xbtcord],
    settings,

    renderMessageAccessory: ({ message }) => (
        <ErrorBoundary noop>
            <MediaInfoRow message={message} />
        </ErrorBoundary>
    )
});
