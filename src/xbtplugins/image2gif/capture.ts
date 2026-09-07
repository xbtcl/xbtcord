/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RgbaFrame } from "./gif";

export interface Source {
    file: File;
    kind: "image" | "video";
    width: number;
    height: number;
    /** Seconds. Zero for a still image. */
    duration: number;
    /** Object URL, owned by the caller - call {@link releaseSource} when done with it. */
    url: string;
}

export interface CaptureOptions {
    width: number;
    fps: number;
    /** Seconds into the video. */
    start: number;
    /** Seconds into the video. */
    end: number;
    /** 1 is real time; 2 plays twice as fast. */
    speed: number;
    onProgress?: (done: number, total: number) => void;
}

export function releaseSource(source: Source | null) {
    if (source) URL.revokeObjectURL(source.url);
}

/** Reads enough of a dropped file to know what we are dealing with. */
export function inspect(file: File): Promise<Source> {
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith("video/") ? "video" : "image";

    return new Promise((resolve, reject) => {
        const fail = (reason: string) => {
            URL.revokeObjectURL(url);
            reject(new Error(reason));
        };

        if (kind === "video") {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.muted = true;
            video.onloadedmetadata = () => resolve({
                file, kind, url,
                width: video.videoWidth,
                height: video.videoHeight,
                // A stream remuxed without a duration reports Infinity; treat that as
                // unknown rather than trying to seek to the end of forever.
                duration: Number.isFinite(video.duration) ? video.duration : 0
            });
            video.onerror = () => fail("That video is in a format this build of Chromium cannot decode.");
            video.src = url;
            return;
        }

        const image = new Image();
        image.onload = () => resolve({
            file, kind, url,
            width: image.naturalWidth,
            height: image.naturalHeight,
            duration: 0
        });
        image.onerror = () => fail("That file did not decode as an image.");
        image.src = url;
    });
}

/** Keeps the aspect ratio, and keeps both sides even, which some decoders are happier with. */
export function scaleTo(source: Source, targetWidth: number) {
    const width = Math.max(2, Math.min(targetWidth, source.width || targetWidth));
    const height = Math.max(2, Math.round(width * (source.height / (source.width || 1))));
    return { width: width - (width % 2), height: height - (height % 2) };
}

function context(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Could not get a 2D canvas. Is hardware acceleration off?");
    return ctx;
}

/**
 * Pulls frames out of a video by seeking to each timestamp and drawing what lands.
 *
 * Seeking one frame at a time is slower than playing the video and grabbing whatever the
 * compositor happens to have, but it is the only way to get evenly spaced frames - a
 * playback capture drops frames whenever the tab is busy, and the result speeds up and
 * slows down at random. Every seek is awaited, so a long clip takes a while; the caller
 * shows progress rather than pretending it is instant.
 */
async function captureVideo(source: Source, options: CaptureOptions): Promise<RgbaFrame[]> {
    const { width, height } = scaleTo(source, options.width);
    const ctx = context(width, height);

    const video = document.createElement("video");
    video.src = source.url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("The video stopped decoding partway through."));
    });

    const start = Math.max(0, options.start);
    const end = Math.max(start + 1 / options.fps, options.end);
    const step = 1 / options.fps;
    const total = Math.max(1, Math.floor((end - start) / step));

    const frames: RgbaFrame[] = [];
    // The GIF plays back at real time unless asked otherwise, so speeding it up means
    // shortening the delays rather than sampling fewer frames.
    const delayMs = (step / Math.max(0.1, options.speed)) * 1000;

    for (let i = 0; i < total; i++) {
        const time = start + i * step;

        await new Promise<void>(resolve => {
            const done = () => {
                video.removeEventListener("seeked", done);
                resolve();
            };
            video.addEventListener("seeked", done);
            video.currentTime = time;
        });

        ctx.drawImage(video, 0, 0, width, height);
        frames.push({ data: ctx.getImageData(0, 0, width, height).data, delayMs });
        options.onProgress?.(i + 1, total);
    }

    return frames;
}

async function captureImage(source: Source, options: CaptureOptions): Promise<RgbaFrame[]> {
    const { width, height } = scaleTo(source, options.width);
    const ctx = context(width, height);

    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The image stopped decoding partway through."));
        image.src = source.url;
    });

    ctx.drawImage(image, 0, 0, width, height);
    options.onProgress?.(1, 1);

    // A still becomes a single long frame. Discord will happily show it, and it is what
    // people want when they convert a PNG so it can sit in a GIF-only slot.
    return [{ data: ctx.getImageData(0, 0, width, height).data, delayMs: 1000 }];
}

export function capture(source: Source, options: CaptureOptions): Promise<RgbaFrame[]> {
    return source.kind === "video" ? captureVideo(source, options) : captureImage(source, options);
}
