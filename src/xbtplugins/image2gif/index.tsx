/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import {
    DraftType, Menu, Modal, openModal,
    showToast, Toasts, UploadHandler, useCallback, useEffect, useRef, useState
} from "@webpack/common";
import { Message } from "@xbtcord/discord-types";

import { capture, inspect, releaseSource, scaleTo, Source } from "./capture";
import { ChatImagePicker, toFile } from "./chatImages";
import { encodeGif } from "./gif";

const WIDTHS = [240, 320, 480, 640, 800];
const FRAME_RATES = [5, 10, 15, 20, 25];

/** Discord's free upload ceiling. Going over it is the most common way this fails. */
const UPLOAD_LIMIT = 10 * 1024 * 1024;

const settings = definePluginSettings({
    defaultWidth: {
        type: OptionType.SELECT,
        description: "Width the converter opens on",
        default: 480,
        options: WIDTHS.map(width => ({ label: `${width}px`, value: width, default: width === 480 }))
    },
    defaultFps: {
        type: OptionType.SELECT,
        description: "Frame rate the converter opens on",
        default: 15,
        options: FRAME_RATES.map(fps => ({ label: `${fps} fps`, value: fps, default: fps === 15 }))
    },
    maxSeconds: {
        type: OptionType.NUMBER,
        description: "Refuse to convert more than this many seconds of video at once",
        default: 20
    }
});

function ByteSize({ bytes }: { bytes: number; }) {
    const over = bytes > UPLOAD_LIMIT;
    const text = bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / 1024 / 1024).toFixed(2)} MB`;

    return <span className={`i2g-summary-size${over ? " i2g-over-limit" : ""}`}>{text}</span>;
}

function Image2GifModal({ initialFile, ...props }: { initialFile?: File; } & any) {
    const [source, setSource] = useState<Source | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [picking, setPicking] = useState(false);

    const [width, setWidth] = useState<number>(settings.store.defaultWidth);
    const [fps, setFps] = useState<number>(settings.store.defaultFps);
    const [colors, setColors] = useState(128);
    const [speed, setSpeed] = useState(1);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);

    const [busy, setBusy] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<{ url: string; bytes: number; blob: Blob; } | null>(null);

    const input = useRef<HTMLInputElement>(null);
    // Kept in a ref so the unmount cleanup sees the latest values without re-running.
    const live = useRef<{ source: Source | null; url: string | null; }>({ source: null, url: null });
    live.current = { source, url: result?.url ?? null };

    useEffect(() => () => {
        releaseSource(live.current.source);
        if (live.current.url) URL.revokeObjectURL(live.current.url);
    }, []);

    const load = useCallback(async (file: File) => {
        setError(null);
        setResult(null);
        try {
            const next = await inspect(file);
            releaseSource(source);
            setSource(next);
            setStart(0);
            setEnd(Math.min(next.duration, settings.store.maxSeconds));
        } catch (err: any) {
            setError(err?.message ?? String(err));
        }
    }, [source]);

    useEffect(() => {
        if (initialFile) load(initialFile);
        // Deliberately runs once: this is only ever for the file the modal was opened
        // with, and re-running it on every load change would reset the picker.
    }, []);

    /*
     * Ctrl+V anywhere in the modal.
     *
     * A paste event carries the file directly, which is the only route that works for an
     * image copied out of another application - navigator.clipboard.read can be blocked
     * or return nothing depending on what put the image there. The button below falls
     * back to that API for people who would rather click than use the keyboard.
     */
    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const file = [...(event.clipboardData?.files ?? [])]
                .find(item => item.type.startsWith("image/") || item.type.startsWith("video/"));

            if (!file) return;
            event.preventDefault();
            setPicking(false);
            load(file);
        };

        document.addEventListener("paste", onPaste, true);
        return () => document.removeEventListener("paste", onPaste, true);
    }, [load]);

    async function pasteFromClipboard() {
        try {
            const items = await navigator.clipboard.read();

            for (const item of items) {
                const type = item.types.find(candidate => candidate.startsWith("image/"));
                if (!type) continue;

                const blob = await item.getType(type);
                const extension = type.split("/")[1]?.split("+")[0] ?? "png";
                setPicking(false);
                await load(new File([blob], `pasted.${extension}`, { type }));
                return;
            }

            setError("There is no image on the clipboard. Copy one, or press Ctrl+V here.");
        } catch {
            setError("The clipboard could not be read. Press Ctrl+V instead - that route always works.");
        }
    }

    const frameCount = source?.kind === "video"
        ? Math.max(1, Math.floor((end - start) * fps))
        : 1;

    const dimensions = source ? scaleTo(source, width) : null;

    async function convert() {
        if (!source) return;

        setError(null);
        setBusy("Reading frames");
        setProgress(0);

        try {
            const frames = await capture(source, {
                width, fps, start, end, speed,
                onProgress: (done, total) => setProgress(done / total / 2)
            });

            setBusy("Encoding");

            // One paint between the two phases, or the progress bar jumps straight from
            // "reading" to "done" and the modal looks frozen on a long clip.
            await new Promise(resolve => requestAnimationFrame(resolve));

            const bytes = encodeGif({
                width: dimensions!.width,
                height: dimensions!.height,
                frames,
                maxColors: colors,
                onProgress: (done, total) => setProgress(0.5 + done / total / 2)
            });

            if (result) URL.revokeObjectURL(result.url);

            const blob = new Blob([bytes as unknown as BlobPart], { type: "image/gif" });
            setResult({ url: URL.createObjectURL(blob), bytes: blob.size, blob });
        } catch (err: any) {
            setError(err?.message ?? String(err));
        } finally {
            setBusy(null);
            setProgress(0);
        }
    }

    function send() {
        const channel = getCurrentChannel();
        if (!result || !channel) return;

        const name = (source?.file.name ?? "image").replace(/\.[^.]+$/, "");
        const file = new File([result.blob], `${name}.gif`, { type: "image/gif" });

        props.onClose();
        // Same one-tick delay the other upload plugins use; the modal has to be gone
        // before the upload prompt takes over the chat bar.
        setTimeout(() => UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage), 10);
    }

    const busyOrEmpty = !!busy || !source;

    return (
        <ErrorBoundary>
            <Modal
                {...props}
                size="lg"
                title="Image to GIF"
                subtitle={source
                    ? `${source.file.name} - ${source.width}x${source.height}${source.duration ? `, ${source.duration.toFixed(1)}s` : ""}`
                    : "Drop something in, tune it, send it"}
                actions={[
                    {
                        text: result ? "Send it" : "Convert",
                        variant: "primary",
                        disabled: busyOrEmpty,
                        onClick: result ? send : convert
                    },
                    ...(result ? [{ text: "Convert again", variant: "secondary" as const, onClick: convert }] : []),
                    { text: "Close", variant: "secondary" as const, onClick: props.onClose }
                ]}
            >
                <div className="i2g-body">
                    <div className="i2g-stage">
                        {result
                            ? <div className="i2g-preview"><img src={result.url} alt="The converted GIF" /></div>
                            : source
                                ? <div className="i2g-preview">
                                    {source.kind === "video"
                                        ? <video src={source.url} controls muted loop />
                                        : <img src={source.url} alt="" />}
                                </div>
                                : picking
                                    ? <ChatImagePicker
                                        onCancel={() => setPicking(false)}
                                        onPick={async media => {
                                            setPicking(false);
                                            setError(null);
                                            try {
                                                await load(await toFile(media));
                                            } catch (err: any) {
                                                setError(err?.message ?? String(err));
                                            }
                                        }}
                                    />
                                    : <div
                                        className={`i2g-drop${dragging ? " i2g-drop-over" : ""}`}
                                        onDragOver={event => { event.preventDefault(); setDragging(true); }}
                                        onDragLeave={() => setDragging(false)}
                                        onDrop={event => {
                                            event.preventDefault();
                                            setDragging(false);
                                            const file = event.dataTransfer?.files?.[0];
                                            if (file) load(file);
                                        }}
                                    >
                                        <div className="i2g-drop-title">Drop an image or a video here</div>
                                        <div className="i2g-drop-hint">
                                            Ctrl+V works too - anything Discord itself can play.
                                        </div>
                                        <div className="i2g-drop-actions">
                                            <Button size="small" onClick={() => input.current?.click()}>Choose a file</Button>
                                            <Button size="small" variant="secondary" onClick={pasteFromClipboard}>Paste</Button>
                                            <Button size="small" variant="secondary" onClick={() => setPicking(true)}>From this chat</Button>
                                        </div>
                                    </div>
                        }

                        {source && (
                            <div className="i2g-meta">
                                <span className="xbt-tag">{dimensions!.width}x{dimensions!.height}</span>
                                <span className="xbt-tag">{frameCount} frame{frameCount === 1 ? "" : "s"}</span>
                                <span className="xbt-tag">{colors} colours</span>
                                {source.kind === "video" && <span className="xbt-tag">{fps} fps</span>}
                                <Button
                                    size="small"
                                    variant="secondary"
                                    onClick={() => { releaseSource(source); setSource(null); setResult(null); }}
                                >
                                    Pick another
                                </Button>
                            </div>
                        )}

                        {busy && (
                            <div className="i2g-field">
                                <div className="i2g-label"><span>{busy}</span><b>{Math.round(progress * 100)}%</b></div>
                                <div className="i2g-progress">
                                    <div className="i2g-progress-bar" style={{ width: `${progress * 100}%` }} />
                                </div>
                            </div>
                        )}

                        {error && <div className="i2g-error">{error}</div>}
                    </div>

                    <div className="i2g-controls">
                        <div className="i2g-field">
                            <div className="i2g-label"><span>Width</span><b>{width}px</b></div>
                            <div className="i2g-chips">
                                {WIDTHS.map(value => (
                                    <button
                                        key={value}
                                        className={`i2g-chip${width === value ? " i2g-chip-active" : ""}`}
                                        onClick={() => setWidth(value)}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {source?.kind === "video" && (
                            <>
                                <div className="i2g-field">
                                    <div className="i2g-label"><span>Frame rate</span><b>{fps} fps</b></div>
                                    <div className="i2g-chips">
                                        {FRAME_RATES.map(value => (
                                            <button
                                                key={value}
                                                className={`i2g-chip${fps === value ? " i2g-chip-active" : ""}`}
                                                onClick={() => setFps(value)}
                                            >
                                                {value}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="i2g-field">
                                    <div className="i2g-label"><span>Start</span><b>{start.toFixed(1)}s</b></div>
                                    <input
                                        className="i2g-range"
                                        type="range"
                                        min={0}
                                        max={Math.max(0.1, source.duration)}
                                        step={0.1}
                                        value={start}
                                        onChange={event => {
                                            const value = Number(event.currentTarget.value);
                                            setStart(value);
                                            if (value >= end) setEnd(Math.min(source.duration, value + 0.5));
                                        }}
                                    />
                                </div>

                                <div className="i2g-field">
                                    <div className="i2g-label"><span>End</span><b>{end.toFixed(1)}s</b></div>
                                    <input
                                        className="i2g-range"
                                        type="range"
                                        min={0}
                                        max={Math.max(0.1, source.duration)}
                                        step={0.1}
                                        value={end}
                                        onChange={event => setEnd(Math.max(start + 0.1, Number(event.currentTarget.value)))}
                                    />
                                </div>

                                <div className="i2g-field">
                                    <div className="i2g-label"><span>Speed</span><b>{speed.toFixed(2)}x</b></div>
                                    <input
                                        className="i2g-range"
                                        type="range"
                                        min={0.25}
                                        max={4}
                                        step={0.25}
                                        value={speed}
                                        onChange={event => setSpeed(Number(event.currentTarget.value))}
                                    />
                                </div>
                            </>
                        )}

                        <div className="i2g-field">
                            <div className="i2g-label"><span>Colours</span><b>{colors}</b></div>
                            <input
                                className="i2g-range"
                                type="range"
                                min={8}
                                max={256}
                                step={8}
                                value={colors}
                                onChange={event => setColors(Number(event.currentTarget.value))}
                            />
                        </div>

                        <div className="i2g-summary">
                            {result
                                ? <>
                                    <ByteSize bytes={result.bytes} />
                                    <span>
                                        {result.bytes > UPLOAD_LIMIT
                                            ? "Over Discord's 10 MB limit. Drop the width, the frame rate or the colour count and convert again."
                                            : "Ready to send."}
                                    </span>
                                </>
                                : <span>
                                    {source
                                        ? "Nothing encoded yet. Hit Convert."
                                        : "Everything happens on this machine - no upload, no service, no account."}
                                </span>
                            }
                        </div>
                    </div>
                </div>

                <input
                    ref={input}
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: "none" }}
                    onChange={event => {
                        const file = event.currentTarget.files?.[0];
                        if (file) load(file);
                        event.currentTarget.value = "";
                    }}
                />
            </Modal>
        </ErrorBoundary>
    );
}

function open(initialFile?: File) {
    openModal(props => <Image2GifModal {...props} initialFile={initialFile} />);
}

/*
 * A picture frame with a conversion arrow curling out of it.
 *
 * The first version of this was a rounded rectangle with GIF lettered inside, which is
 * almost exactly Discord's own GIF picker button sitting two icons along - so in the chat
 * bar you got the same glyph twice and no way to tell which was which. This one reads as
 * "turn this picture into something else" at 24px and shares nothing with the neighbour.
 */
function GifIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                fill="currentColor"
                d="M4 3.5A2.5 2.5 0 0 0 1.5 6v9A2.5 2.5 0 0 0 4 17.5h5.2a6.6 6.6 0 0 1-.19-1.5H4a1 1 0 0 1-1-1v-.94l3.2-2.84a1 1 0 0 1 1.3-.02l2.55 2.1a6.6 6.6 0 0 1 1.2-1.16L9.4 10.1a2.5 2.5 0 0 0-3.2.05L3 12.98V6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3.6c.53.09 1.03.25 1.5.46V6A2.5 2.5 0 0 0 16 3.5H4Z"
            />
            <circle cx="13.2" cy="8.1" r="1.6" fill="currentColor" />
            <path
                fill="currentColor"
                d="M16.75 11a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5Zm0 1.6a3.65 3.65 0 0 1 3.14 1.79l-1.02.6a2.47 2.47 0 1 0 .3 2.26h-1.55v-1.2h2.98v.55a3.65 3.65 0 1 1-3.85-4Z"
            />
        </svg>
    );
}

/** The one attachment on a message we can actually turn into a GIF. */
function convertibleAttachment(message?: Message) {
    return message?.attachments?.find(attachment =>
        attachment.content_type?.startsWith("image/") || attachment.content_type?.startsWith("video/"));
}

const renderButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;

    return (
        <ChatBarButton tooltip="Image to GIF" onClick={() => open()}>
            <GifIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "Image2Gif",
    description: "Turns an image or a clip into a GIF right in the chat bar - width, frame rate, trim, speed and palette, all encoded on your own machine",
    tags: ["Utility", "Media"],
    searchTerms: ["gif", "convert", "image", "video", "mp4", "webm", "encode", "animation"],
    authors: [Devs.Xbtcord],
    settings,

    chatBarButton: {
        render: renderButton,
        icon: GifIcon
    },

    contextMenus: {
        message: (children, { message }: { message?: Message; }) => {
            const attachment = convertibleAttachment(message);
            if (!attachment) return;

            children.push(
                <Menu.MenuItem
                    id="xbt-image2gif"
                    label="Convert to GIF"
                    icon={GifIcon}
                    action={async () => {
                        try {
                            /*
                             * Discord's CDN sends permissive CORS headers, so this is a
                             * plain fetch rather than anything clever. If that ever stops
                             * being true the canvas would be tainted and getImageData
                             * would throw, so the failure is caught and explained here
                             * instead of surfacing as a security error from the encoder.
                             */
                            const response = await fetch(attachment.url);
                            if (!response.ok) throw new Error(`The CDN answered ${response.status}`);

                            const blob = await response.blob();
                            open(new File([blob], attachment.filename, { type: blob.type || attachment.content_type! }));
                        } catch (err: any) {
                            showToast(`Could not download that attachment: ${err?.message ?? err}`, Toasts.Type.FAILURE);
                        }
                    }}
                />
            );
        }
    },

    toolboxActions: {
        "Image to GIF": () => open()
    }
});
