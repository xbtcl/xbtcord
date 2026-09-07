/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { ImageIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { DraftType, openModal, showToast, Toasts, UploadHandler, useState } from "@webpack/common";
import { XbtModal } from "@xbtplugins/_shared/ui";

const settings = definePluginSettings({
    targetMb: {
        type: OptionType.SLIDER,
        description: "Aim for this many megabytes",
        markers: [1, 2, 4, 6, 8, 10],
        default: 8,
        stickToMarkers: false
    },
    maxDimension: {
        type: OptionType.SELECT,
        description: "Never make an image larger than this on its longest side",
        default: 2048,
        options: [
            { label: "1280px", value: 1280 },
            { label: "1920px", value: 1920 },
            { label: "2048px", value: 2048, default: true },
            { label: "4096px", value: 4096 }
        ]
    },
    format: {
        type: OptionType.SELECT,
        description: "What to re-encode as",
        default: "image/webp",
        options: [
            { label: "WebP - smallest", value: "image/webp", default: true },
            { label: "JPEG - most compatible", value: "image/jpeg" }
        ]
    }
});

interface Result {
    file: File;
    before: number;
    after: number;
    width: number;
    height: number;
}

function draw(image: HTMLImageElement, scale: number) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas.");

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The browser refused to encode that.")), type, quality));
}

/**
 * Walks the quality down, then the size, until it fits.
 *
 * Quality first because dropping from 0.92 to 0.7 is close to invisible and often halves
 * the file, while halving the resolution is immediately obvious. Only once quality is
 * exhausted does it start scaling, and it stops as soon as the target is met rather than
 * squeezing further for the sake of it.
 */
async function compress(file: File, targetBytes: number): Promise<Result> {
    const url = URL.createObjectURL(file);

    try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("That file did not decode as an image."));
            image.src = url;
        });

        const longest = Math.max(image.naturalWidth, image.naturalHeight);
        const maxDimension = settings.store.maxDimension as number;
        let scale = longest > maxDimension ? maxDimension / longest : 1;

        const type = settings.store.format as string;
        const extension = type === "image/webp" ? "webp" : "jpg";
        const name = file.name.replace(/\.[^.]+$/, "") + "." + extension;

        let best: Blob | null = null;
        let canvas = draw(image, scale);

        for (let attempt = 0; attempt < 8; attempt++) {
            for (const quality of [0.92, 0.8, 0.7, 0.6, 0.5]) {
                const blob = await toBlob(canvas, type, quality);
                if (!best || blob.size < best.size) best = blob;
                if (blob.size <= targetBytes) {
                    return {
                        file: new File([blob], name, { type }),
                        before: file.size, after: blob.size,
                        width: canvas.width, height: canvas.height
                    };
                }
            }

            scale *= 0.75;
            if (Math.round(image.naturalWidth * scale) < 64) break;
            canvas = draw(image, scale);
        }

        return {
            file: new File([best!], name, { type }),
            before: file.size, after: best!.size,
            width: canvas.width, height: canvas.height
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function CompressorModal(props: any) {
    const [results, setResults] = useState<Result[]>([]);
    const [busy, setBusy] = useState(false);

    async function pick() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.multiple = true;

        input.onchange = async () => {
            const files = [...(input.files ?? [])];
            if (!files.length) return;

            setBusy(true);
            try {
                const target = (settings.store.targetMb as number) * 1024 * 1024;
                setResults(await Promise.all(files.map(file => compress(file, target))));
            } catch (err: any) {
                showToast(err?.message ?? String(err), Toasts.Type.FAILURE);
            } finally {
                setBusy(false);
            }
        };

        input.click();
    }

    function upload() {
        const channel = getCurrentChannel();
        if (!channel || !results.length) return;

        props.onClose();
        setTimeout(() => UploadHandler.promptToUpload(results.map(result => result.file), channel, DraftType.ChannelMessage), 10);
    }

    return (
        <XbtModal props={props} title="Shrink before sending" subtitle="Re-encoded here, never uploaded anywhere first">
            <div className="xbt-list">
                {results.map(result => (
                    <div className="xbt-row" key={result.file.name}>
                        <div className="xbt-row-body">
                            <div>{result.file.name}</div>
                            <div className="xbt-row-meta">
                                {Math.round(result.before / 1024)} KB to {Math.round(result.after / 1024)} KB
                                {" "}({Math.max(0, Math.round((1 - result.after / result.before) * 100))}% off)
                                {" "}at {result.width}x{result.height}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="xbt-form-row" style={{ marginTop: 12 }}>
                <Button variant="secondary" disabled={busy} onClick={pick}>
                    {busy ? "Working..." : results.length ? "Pick different images" : "Pick images"}
                </Button>
                <Button disabled={!results.length} onClick={upload}>Upload</Button>
            </div>
        </XbtModal>
    );
}

const renderButton: ChatBarButtonFactory = ({ isMainChat }) =>
    isMainChat
        ? <ChatBarButton tooltip="Shrink an image before sending" onClick={() => openModal(props => <CompressorModal {...props} />)}>
            <ImageIcon />
        </ChatBarButton>
        : null;

export default definePlugin({
    name: "ImageCompressor",
    description: "Squeezes big images down to a size Discord will accept, without an upload site in the middle",
    tags: ["Utility", "Media"],
    searchTerms: ["compress", "shrink", "resize", "image", "upload", "size", "webp"],
    authors: [Devs.Xbtcord],
    settings,

    chatBarButton: {
        render: renderButton,
        icon: ImageIcon
    }
});
