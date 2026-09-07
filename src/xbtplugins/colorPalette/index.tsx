/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { Menu, openModal, useEffect, useState } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { Empty, XbtModal } from "@xbtplugins/_shared/ui";

/**
 * Pulls the handful of colours an image is actually made of.
 *
 * Buckets every pixel into a coarse 4-bit-per-channel cube and takes the fullest buckets.
 * A proper k-means would be prettier and would also take a second per image; this is
 * instant and lands on the same answers for the things people run it on - art, a
 * screenshot, somebody's banner.
 */
function extract(data: Uint8ClampedArray, count: number): string[] {
    const buckets = new Map<number, { count: number; r: number; g: number; b: number; }>();

    for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 128) continue;

        const r = data[index], g = data[index + 1], b = data[index + 2];
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

        const bucket = buckets.get(key);
        if (bucket) {
            bucket.count++;
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
        } else {
            buckets.set(key, { count: 1, r, g, b });
        }
    }

    return [...buckets.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, count)
        .map(bucket => "#" + [bucket.r, bucket.g, bucket.b]
            .map(total => Math.round(total / bucket.count).toString(16).padStart(2, "0"))
            .join(""));
}

async function paletteOf(url: string): Promise<string[]> {
    const image = new Image();
    image.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not load that image. The CDN may have refused the request."));
        image.src = url;
    });

    // Downscaled hard on purpose: the palette of a thumbnail is the palette of the
    // picture, and reading four million pixels to find six colours is a waste.
    const size = 120;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = Math.max(1, Math.round(size * (image.naturalHeight / image.naturalWidth)));

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not get a 2D canvas.");

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return extract(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 8);
}

function PaletteModal({ url, ...props }: { url: string; } & any) {
    const [colours, setColours] = useState<string[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        paletteOf(url).then(setColours).catch(err => setError(err?.message ?? String(err)));
    }, [url]);

    return (
        <XbtModal props={props} title="Colours in this image" subtitle="Click one to copy it">
            {error && <Empty>{error}</Empty>}
            {!error && !colours && <Empty>Reading the image...</Empty>}

            {colours && (
                <div className="xbt-palette">
                    {colours.map(colour => (
                        <button
                            key={colour}
                            className="xbt-palette-swatch"
                            style={{ background: colour }}
                            onClick={() => copyWithToast(colour, `${colour} copied`)}
                        >
                            <span className="xbt-palette-hex">{colour}</span>
                        </button>
                    ))}
                </div>
            )}

            {colours && (
                <button className="xbt-palette-copy-all" onClick={() => copyWithToast(colours.join("\n"), "Palette copied")}>
                    Copy all
                </button>
            )}
        </XbtModal>
    );
}

function imageOn(message?: Message): string | null {
    const attachment = message?.attachments?.find(item => item.content_type?.startsWith("image/"));
    if (attachment) return attachment.url;

    const embed = (message as any)?.embeds?.find((item: any) => item?.image?.url || item?.thumbnail?.url);
    return embed?.image?.url ?? embed?.thumbnail?.url ?? null;
}

export default definePlugin({
    name: "ColorPalette",
    description: "Pulls the main colours out of any image in chat, for themes, graphics or picking a role colour",
    tags: ["Utility", "Appearance", "Media"],
    searchTerms: ["colour", "color", "palette", "image", "hex", "eyedropper", "theme"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            const url = imageOn(message);
            if (!url) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-colour-palette"
                    label="Get the colours"
                    icon={ImageIcon}
                    action={() => openModal(props => <PaletteModal {...props} url={url} />)}
                />
            );
        }
    }
});
