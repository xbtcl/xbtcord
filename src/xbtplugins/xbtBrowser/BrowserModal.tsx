/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/glass.css";
import "./styles.css";

import { Notice } from "@components/Notice";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import { Modal, openModal, useEffect, useRef, useState } from "@webpack/common";
import type { RenderModalProps } from "@xbtcord/discord-types";

import { currentConfig, searchEngine } from "./config";
import { BrowserStats, displayUrl, EMPTY_STATS, toNavigableUrl } from "./policy";

const cl = classNameFactory("xbt-br-");
export const logger = new Logger("XbtBrowser", "#a78bfa");

const Native = XbtcordNative.pluginHelpers.XbtBrowser as PluginNative<typeof import("./native")> | undefined;

/**
 * The bits of Electron's `<webview>` this uses.
 *
 * The element is built by hand rather than written as JSX for two reasons: React would
 * re-apply `src` on every render and yank the page back to where it started, and the
 * attributes have to be in place before the element is attached, which is when the guest
 * is actually created.
 */
interface TriWebView extends HTMLElement {
    src: string;
    loadURL(url: string): Promise<void>;
    getURL(): string;
    canGoBack?(): boolean;
    canGoForward?(): boolean;
    goBack?(): void;
    goForward?(): void;
    navigationHistory?: {
        canGoBack(): boolean;
        canGoForward(): boolean;
        goBack(): void;
        goForward(): void;
    };
    reload(): void;
    stop(): void;
    getWebContentsId(): number;
}

/**
 * Whether Electron's webview tag is actually usable.
 *
 * It has to be switched on for the whole window at creation time, which Xbtcord does in
 * the main-process patcher - so a client that has updated but not yet been restarted will
 * be running new renderer code against an old window. That case is worth detecting rather
 * than showing an empty rectangle.
 */
let webviewAvailable: boolean | null = null;

export function isWebviewAvailable(): boolean {
    // Memoised because the probe builds an element, and this is read on every render.
    if (webviewAvailable === null) {
        try {
            webviewAvailable = typeof (document.createElement("webview") as Partial<TriWebView>).getWebContentsId === "function";
        } catch {
            webviewAvailable = false;
        }
    }
    return webviewAvailable;
}

export interface BrowsingSession {
    partition: string;
    userAgent: string;
}

/**
 * The filtered session, prepared once and kept.
 *
 * Preparing it is an IPC round-trip, and the view cannot be built until it returns. Doing
 * that on first open put the round-trip between the click and the page starting to load,
 * on top of an extra render. The plugin warms it at startup instead, so by the time a link
 * is clicked the answer is already here and the guest starts in the same tick as the modal.
 */
let browsingSession: BrowsingSession | null = null;
let sessionPending: Promise<BrowsingSession> | null = null;

export function getSession(): BrowsingSession | Promise<BrowsingSession> {
    if (browsingSession) return browsingSession;
    if (!Native) return Promise.reject(new Error("No main process to prepare a session in"));

    sessionPending ??= Native.prepare(currentConfig())
        .then(result => {
            browsingSession = result;
            sessionPending = null;
            return result;
        })
        .catch(err => {
            sessionPending = null;
            throw err;
        });

    return sessionPending;
}

/** Called at plugin start so the first click has nothing to wait for. */
export function warmUp() {
    if (!isWebviewAvailable()) return;

    Promise.resolve(getSession())
        .catch(err => logger.warn("Couldn't warm up the browsing session", err));
}

/** The partition depends on the persist setting, so a change makes the cache wrong. */
export function invalidateSession() {
    browsingSession = null;
    sessionPending = null;
}

/**
 * Set while a browser modal is open, so a second link reuses that window instead of
 * stacking another one on top of it.
 */
let activeNavigate: ((url: string) => void) | null = null;

export function isBrowserOpen() {
    return activeNavigate != null;
}

export function openXbtBrowser(url: string) {
    if (activeNavigate) {
        activeNavigate(url);
        return;
    }

    openModal(props => <BrowserModal {...props} initialUrl={url} />);
}

function canGo(view: TriWebView | null, direction: "back" | "forward"): boolean {
    if (!view) return false;
    try {
        const { navigationHistory } = view;
        if (navigationHistory) {
            return direction === "back" ? navigationHistory.canGoBack() : navigationHistory.canGoForward();
        }
        return direction === "back" ? !!view.canGoBack?.() : !!view.canGoForward?.();
    } catch {
        // Thrown before the guest is attached, which just means there is no history yet.
        return false;
    }
}

function go(view: TriWebView | null, direction: "back" | "forward") {
    if (!view) return;
    try {
        const { navigationHistory } = view;
        if (navigationHistory) {
            if (direction === "back") navigationHistory.goBack();
            else navigationHistory.goForward();
            return;
        }
        if (direction === "back") view.goBack?.();
        else view.goForward?.();
    } catch (err) {
        logger.warn("Couldn't move through history", err);
    }
}

function ArrowIcon({ direction }: { direction: "left" | "right"; }) {
    return (
        <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                transform={direction === "right" ? "rotate(180 12 12)" : undefined}
                d="M15.7 4.3a1 1 0 0 1 0 1.4L9.4 12l6.3 6.3a1 1 0 0 1-1.4 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0Z"
            />
        </svg>
    );
}

function ReloadIcon() {
    return (
        <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 5a7 7 0 1 0 6.6 4.7 1 1 0 0 1 1.9-.7A9 9 0 1 1 12 3a9 9 0 0 1 5 1.5V3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1h-4a1 1 0 1 1 0-2h1.2A7 7 0 0 0 12 5Z"
            />
        </svg>
    );
}

function StopIcon() {
    return (
        <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7 7h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 2.2 5 5v6.2c0 4.3 2.9 8.3 7 9.6 4.1-1.3 7-5.3 7-9.6V5l-7-2.8Zm0 2.2 5 2v4.8c0 3.3-2.1 6.4-5 7.5-2.9-1.1-5-4.2-5-7.5V6.4l5-2Z"
            />
        </svg>
    );
}

function ExternalIcon() {
    return (
        <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M14 3a1 1 0 0 0 0 2h3.6l-7.3 7.3a1 1 0 1 0 1.4 1.4L19 6.4V10a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-6ZM5 5h4a1 1 0 1 0 0-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a1 1 0 1 0-2 0v4H5V5Z"
            />
        </svg>
    );
}

interface LoadFailure {
    code: number;
    description: string;
    url: string;
}

function BrowserModal({ initialUrl, ...props }: RenderModalProps & { initialUrl: string; }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<TriWebView | null>(null);
    /** The address the view was created with. Changing it later would reload the guest. */
    const startUrl = useRef(initialUrl);
    /** Read from inside listeners that are attached once, so it cannot be plain state. */
    const editingRef = useRef(false);

    // Already resolved when the session was warmed at startup, which is the normal case -
    // the view is then built on this very first render rather than after a round-trip.
    const [session, setSession] = useState<BrowsingSession | null>(browsingSession);
    const [unavailable, setUnavailable] = useState<string | null>(null);

    const [address, setAddress] = useState(displayUrl(initialUrl));
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [pageTitle, setPageTitle] = useState("");
    const [loading, setLoading] = useState(true);
    const [nav, setNav] = useState({ back: false, forward: false });
    const [failure, setFailure] = useState<LoadFailure | null>(null);
    const [stats, setStats] = useState<BrowserStats>(EMPTY_STATS);

    const supported = isWebviewAvailable();

    // Ask the main process to filter the session before anything is allowed to load.
    useEffect(() => {
        if (!supported) {
            setUnavailable(
                Native
                    ? "Restart Discord to finish switching XbtBrowser on - the isolated view has to be enabled when the window is created."
                    : "XbtBrowser needs the desktop app; there is no isolated session to browse in on the web."
            );
            return;
        }

        if (session) return;

        let alive = true;
        Promise.resolve(getSession())
            .then(result => { if (alive) setSession(result); })
            .catch(err => {
                logger.error("Couldn't prepare the browsing session", err);
                if (alive) setUnavailable(String(err?.message ?? err));
            });

        return () => { alive = false; };
    }, [supported, session]);

    // Build the view once the session behind it is filtered, and never again.
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !session) return;

        const view = document.createElement("webview") as TriWebView;
        view.className = cl("view");
        view.setAttribute("partition", session.partition);
        view.setAttribute("useragent", session.userAgent);
        // Popups are allowed only so the main process can catch them and load them in
        // this same view. Without the attribute a target="_blank" link is simply dead.
        view.setAttribute("allowpopups", "");
        view.setAttribute("webpreferences", "contextIsolation=yes,sandbox=yes,nodeIntegration=no");
        view.setAttribute("src", startUrl.current);

        const syncNav = () => {
            const next = { back: canGo(view, "back"), forward: canGo(view, "forward") };
            // Re-rendering on every navigation event when nothing moved makes the whole
            // panel feel heavier than it is.
            setNav(prev => (prev.back === next.back && prev.forward === next.forward ? prev : next));
        };

        const onStartLoading = () => { setLoading(true); setFailure(null); syncNav(); };
        const onStopLoading = () => { setLoading(false); syncNav(); };
        const onNavigate = (event: any) => {
            if (typeof event?.url !== "string") return;
            setCurrentUrl(event.url);
            if (!editingRef.current) setAddress(displayUrl(event.url));
            syncNav();
        };
        const onNavigateInPage = (event: any) => { if (event?.isMainFrame) onNavigate(event); };
        const onTitle = (event: any) => setPageTitle(String(event?.title ?? ""));
        const onFail = (event: any) => {
            // -3 is ABORTED: what a navigation cancelled by another navigation looks like.
            if (!event?.isMainFrame || event.errorCode === -3) return;
            setFailure({
                code: event.errorCode,
                description: String(event.errorDescription ?? "Unknown error"),
                url: String(event.validatedURL ?? "")
            });
            setLoading(false);
        };

        view.addEventListener("did-start-loading", onStartLoading);
        view.addEventListener("did-stop-loading", onStopLoading);
        view.addEventListener("did-navigate", onNavigate);
        view.addEventListener("did-navigate-in-page", onNavigateInPage);
        view.addEventListener("page-title-updated", onTitle);
        view.addEventListener("did-fail-load", onFail);

        host.appendChild(view);
        viewRef.current = view;

        return () => {
            view.removeEventListener("did-start-loading", onStartLoading);
            view.removeEventListener("did-stop-loading", onStopLoading);
            view.removeEventListener("did-navigate", onNavigate);
            view.removeEventListener("did-navigate-in-page", onNavigateInPage);
            view.removeEventListener("page-title-updated", onTitle);
            view.removeEventListener("did-fail-load", onFail);
            view.remove();
            viewRef.current = null;
        };
    }, [session]);

    // A second link clicked while this is open navigates here instead of stacking.
    useEffect(() => {
        activeNavigate = url => {
            const view = viewRef.current;
            if (!view) {
                startUrl.current = url;
                return;
            }
            setLoading(true);
            view.loadURL(url).catch(err => logger.warn("Couldn't navigate", err));
        };
        return () => { activeNavigate = null; };
    }, []);

    useEffect(() => {
        if (!session || !Native) return;

        let alive = true;
        const timer = setInterval(() => {
            const view = viewRef.current;
            if (!view) return;

            let id: number;
            try {
                id = view.getWebContentsId();
            } catch {
                return; // Not attached yet.
            }

            Native.getStats(id)
                .then(next => {
                    if (!alive) return;
                    // Most polls find nothing new; swapping in an equal object would
                    // re-render the panel a few times a second for no reason.
                    setStats(prev => (
                        prev.blocked === next.blocked
                            && prev.stripped === next.stripped
                            && prev.cookiesBlocked === next.cookiesBlocked
                            && prev.blockedDownload === next.blockedDownload
                            ? prev
                            : next
                    ));
                })
                .catch(() => { /* counters are informational */ });
        }, 1500);

        return () => { alive = false; clearInterval(timer); };
    }, [session]);

    function navigate(raw: string) {
        const target = toNavigableUrl(raw, searchEngine());
        if (!target) return;

        const view = viewRef.current;
        if (!view) {
            startUrl.current = target;
            return;
        }

        // The guest takes a moment to report that it has started. Showing the bar now is
        // the difference between the panel feeling immediate and feeling like it missed
        // the click.
        setLoading(true);
        view.loadURL(target).catch(err => logger.warn("Couldn't navigate", err));
    }

    /** History moves are real navigations, so they get the same immediate feedback. */
    function moveHistory(direction: "back" | "forward") {
        setLoading(true);
        go(viewRef.current, direction);
    }

    function openExternally(url = currentUrl) {
        Native?.openExternally(url).catch(err => logger.error("Couldn't hand the link over", err));
    }

    function dismissDownload() {
        const view = viewRef.current;
        if (!view || !Native) return;
        try {
            Native.acknowledgeDownload(view.getWebContentsId()).catch(() => { });
        } catch {
            // No guest, nothing to acknowledge.
        }
        setStats(prev => ({ ...prev, blockedDownload: null }));
    }

    const totalStopped = stats.blocked + stats.stripped + stats.cookiesBlocked;

    return (
        <Modal
            {...props}
            size="xxl"
            title="XbtBrowser"
            subtitle={pageTitle || displayUrl(currentUrl)}
            actions={[
                {
                    text: "Open in your browser",
                    variant: "secondary",
                    onClick: () => openExternally()
                },
                {
                    text: "Close",
                    variant: "primary",
                    onClick: () => props.onClose()
                }
            ]}
        >
            <div className={cl("shell")}>
                <div className={cl("chrome")}>
                    <button
                        className={cl("nav")}
                        disabled={!nav.back}
                        title="Back"
                        aria-label="Back"
                        onClick={() => moveHistory("back")}
                    >
                        <ArrowIcon direction="left" />
                    </button>
                    <button
                        className={cl("nav")}
                        disabled={!nav.forward}
                        title="Forward"
                        aria-label="Forward"
                        onClick={() => moveHistory("forward")}
                    >
                        <ArrowIcon direction="right" />
                    </button>
                    <button
                        className={cl("nav")}
                        title={loading ? "Stop" : "Reload"}
                        aria-label={loading ? "Stop" : "Reload"}
                        onClick={() => {
                            const view = viewRef.current;
                            if (!view) return;
                            if (loading) { view.stop(); return; }
                            setLoading(true);
                            view.reload();
                        }}
                    >
                        {loading ? <StopIcon /> : <ReloadIcon />}
                    </button>

                    <form
                        className={cl("address-form")}
                        onSubmit={event => {
                            event.preventDefault();
                            navigate(address);
                            editingRef.current = false;
                            (document.activeElement as HTMLElement | null)?.blur?.();
                        }}
                    >
                        {/*
                          * A plain input rather than Discord's TextInput: this is an address
                          * bar, so it wants to be one line of monospace-ish text that submits
                          * on Enter, not a form field with a label and its own layout rules.
                          */}
                        <input
                            className={cl("address")}
                            value={address}
                            spellCheck={false}
                            autoComplete="off"
                            placeholder="Search, or type an address"
                            aria-label="Address"
                            onChange={event => setAddress(event.currentTarget.value)}
                            onFocus={event => {
                                editingRef.current = true;
                                event.currentTarget.select();
                            }}
                            onBlur={() => {
                                editingRef.current = false;
                                setAddress(displayUrl(currentUrl));
                            }}
                            onKeyDown={event => {
                                if (event.key !== "Escape") return;
                                event.stopPropagation();
                                setAddress(displayUrl(currentUrl));
                                event.currentTarget.blur();
                            }}
                        />
                    </form>

                    <div
                        className={cl("shield", { "shield-active": totalStopped > 0 })}
                        title={
                            totalStopped === 0
                                ? "Nothing to block on this page yet"
                                : [
                                    `${stats.blocked} tracker request${stats.blocked === 1 ? "" : "s"} blocked`,
                                    `${stats.stripped} tracking parameter${stats.stripped === 1 ? "" : "s"} stripped`,
                                    `${stats.cookiesBlocked} third-party cookie${stats.cookiesBlocked === 1 ? "" : "s"} refused`,
                                    ...stats.topHosts.map(h => `  ${h.host} x${h.count}`)
                                ].join("\n")
                        }
                    >
                        <ShieldIcon />
                        <span>{totalStopped}</span>
                    </div>

                    <button
                        className={cl("nav")}
                        title="Open this page in your real browser"
                        aria-label="Open in your browser"
                        onClick={() => openExternally()}
                    >
                        <ExternalIcon />
                    </button>
                </div>

                <div className={cl("progress", { "progress-on": loading })} aria-hidden />

                {stats.blockedDownload && (
                    <Notice
                        variant="warning"
                        className={cl("notice")}
                        action={
                            <button
                                className={cl("message-action")}
                                onClick={() => { openExternally(stats.blockedDownload!); dismissDownload(); }}
                            >
                                Open in your browser
                            </button>
                        }
                    >
                        This page tried to download a file. Downloads are blocked in the isolated
                        view - open it in your real browser if you meant to save it.
                    </Notice>
                )}

                <div className={cl("stage")} ref={hostRef}>
                    {unavailable && (
                        <div className={cl("message")}>
                            <Notice variant="warning">{unavailable}</Notice>
                            <button className={cl("message-action")} onClick={() => openExternally(startUrl.current)}>
                                Open {displayUrl(startUrl.current)} in your browser
                            </button>
                        </div>
                    )}

                    {!unavailable && !session && (
                        <div className={cl("message")}>
                            <span className={cl("message-text")}>Setting up an isolated session...</span>
                        </div>
                    )}

                    {failure && (
                        <div className={cl("message", "message-over")}>
                            <Notice variant="danger">
                                Couldn't load {displayUrl(failure.url) || "this page"} - {failure.description} ({failure.code}).
                            </Notice>
                            <button className={cl("message-action")} onClick={() => viewRef.current?.reload()}>
                                Try again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
