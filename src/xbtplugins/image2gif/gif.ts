/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { applyPalette, GIFEncoder, quantize } from "gifenc";

export interface RgbaFrame {
    /** RGBA, width * height * 4, as it comes out of a canvas. */
    data: Uint8ClampedArray;
    /** How long this frame is shown, in milliseconds. */
    delayMs: number;
}

export interface EncodeOptions {
    width: number;
    height: number;
    frames: RgbaFrame[];
    /** Palette size. Fewer colours means a smaller file and visible banding. */
    maxColors?: number;
    onProgress?: (done: number, total: number) => void;
}

/**
 * Writes a GIF, on the same encoder FakeNitro and PetPet already use.
 *
 * The one thing done differently here is the palette. Those two quantise every frame
 * separately, which is right for their case - a sticker where each frame is a different
 * picture - but wrong for a clip, where a per-frame palette makes flat colours crawl and
 * shimmer between frames. One palette built from a sample of the whole animation costs a
 * little accuracy on any single frame and looks far steadier in motion, and it saves 768
 * bytes a frame on top.
 */
export function encodeGif({ width, height, frames, maxColors = 256, onProgress }: EncodeOptions): Uint8Array {
    if (!frames.length) throw new Error("Nothing to encode");

    /*
     * quantize wants one flat RGBA buffer. Sampling every Nth frame keeps that buffer to
     * a few megabytes on a long clip - the palette of eight evenly spaced frames is the
     * palette of the clip, and building it from all 300 of them would only be slower.
     */
    const step = Math.max(1, Math.ceil(frames.length / 8));
    const sampled = frames.filter((_, index) => index % step === 0);

    const pixels = width * height * 4;
    const sample = new Uint8ClampedArray(pixels * sampled.length);
    sampled.forEach((frame, index) => sample.set(frame.data, index * pixels));

    const palette = quantize(sample, Math.max(2, Math.min(256, maxColors)));

    const gif = GIFEncoder();

    frames.forEach((frame, index) => {
        gif.writeFrame(applyPalette(frame.data, palette), width, height, {
            palette,
            /*
             * Delays are stored in hundredths of a second, and every browser clamps
             * anything under 2 up to 10 - so asking for 100 fps gets you a GIF that plays
             * at a tenth of the speed you wanted. Two is the honest floor.
             */
            delay: Math.max(20, Math.round(frame.delayMs))
        });

        onProgress?.(index + 1, frames.length);
    });

    gif.finish();
    return gif.bytesView();
}
