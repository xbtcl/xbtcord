/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ApplicationCommandInputType } from "@api/Commands";
import ErrorBoundary from "@components/ErrorBoundary";
import { ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel, openImageModal } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, MessageStore, Modal, openModal, Text, useMemo } from "@webpack/common";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

interface Item {
    url: string;
    proxyUrl: string;
    width: number;
    height: number;
    filename: string;
    author: string;
    messageId: string;
    at: number;
}

/** Built from the loaded messages, so it opens instantly and makes no requests. */
function collect(channelId: string): Item[] {
    const messages: any[] = MessageStore.getMessages(channelId)?.toArray?.() ?? [];
    const items: Item[] = [];

    for (const message of messages) {
        for (const attachment of message.attachments ?? []) {
            // Only things that can actually be shown as a thumbnail.
            if (!attachment.width || !attachment.height) continue;
            if (attachment.content_type && !attachment.content_type.startsWith("image/")) continue;

            items.push({
                url: attachment.url,
                proxyUrl: attachment.proxy_url ?? attachment.url,
                width: attachment.width,
                height: attachment.height,
                filename: attachment.filename ?? "image",
                author: message.author?.username ?? "Unknown",
                messageId: message.id,
                at: new Date(message.timestamp).getTime()
            });
        }
    }

    return items.sort((a, b) => b.at - a.at);
}

function Gallery({ channelId, close }: { channelId: string; close(): void; }) {
    const items = useMemo(() => collect(channelId), [channelId]);

    if (!items.length) {
        return <div className="xbt-gallery-empty">No images in what's loaded here. Scroll up a little first.</div>;
    }

    return (
        <>
            <Text variant="text-xs/normal" className="xbt-gallery-count">
                {items.length} image{items.length === 1 ? "" : "s"} from the loaded messages
            </Text>
            <div className="xbt-gallery">
                {items.map(item => (
                    <div className="xbt-gallery-tile" key={`${item.messageId}-${item.url}`}>
                        <img
                            src={`${item.proxyUrl}${item.proxyUrl.includes("?") ? "&" : "?"}width=200&height=200`}
                            alt={item.filename}
                            loading="lazy"
                            onClick={() => openImageModal({
                                url: item.url,
                                width: item.width,
                                height: item.height
                            })}
                        />
                        <button
                            className="xbt-gallery-jump"
                            title={`${item.author} — jump to message`}
                            onClick={() => { jumpToMessage(channelId, item.messageId); close(); }}
                        >
                            {item.author}
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}

function open(channelId?: string) {
    const id = channelId ?? getCurrentChannel()?.id;
    if (!id) return;

    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title={`Images in ${describeChannel(id)}`}
                size="lg"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <Gallery channelId={id} close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "AttachmentGallery",
    description: "Every image in the channel as a grid, instead of scrolling for it",
    tags: ["Media", "Utility"],
    searchTerms: ["gallery", "images", "attachments", "grid", "photos", "media"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "gallery",
            description: "Show every image loaded in this channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: () => void open()
        }
    ],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: any; }) => {
            if (!channel?.id) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-gallery"
                    label="Image gallery"
                    icon={ImageIcon}
                    action={() => open(channel.id)}
                />
            );
        }
    },

    toolboxActions: {
        "Image gallery": () => open()
    }
});
