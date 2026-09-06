/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import { createRoot } from "@webpack/common";
import { ReactNode } from "react";
import type { Root } from "react-dom/client";

const logger = new Logger("ProfileSlot");

/**
 * Renders things underneath "Member Since" on a user profile.
 *
 * Equicord does this with a ProfileSectionsAPI plugin whose patches hang off
 * `#{intl::USER_PROFILE_MEMBER_SINCE}`. That API was never ported to this fork - nothing
 * here provides `Api.ProfileSections`, and upstream endcord has no copy either - so every
 * plugin declaring it as a dependency simply refused to start, silently, forever.
 *
 * Rather than port a patch set aimed at three separate minified profile layouts, this
 * finds the element and mounts next to it. The user id comes from React's own props via
 * the fiber, never guessed from the DOM. Nothing is patched, so this cannot crash the
 * client or break a profile; if Discord renames the element the sections quietly stop
 * appearing, which is the only acceptable way for cosmetic UI to fail.
 */
export type ProfileSlotRenderer = (userId: string) => ReactNode;

const renderers = new Map<string, ProfileSlotRenderer>();
const mounted = new Map<HTMLElement, { host: HTMLElement; root: Root; userId: string; }>();

const HOST_CLASS = "xbt-profile-slot";

export function addProfileSlot(key: string, render: ProfileSlotRenderer) {
    renderers.set(key, render);
    ensureObserver();
    schedule();
}

export function removeProfileSlot(key: string) {
    renderers.delete(key);
    schedule();
}

/** Walks up the fiber to the component that was handed a userId. */
function fiberUserId(node: Element): string | null {
    const fiberKey = Object.keys(node).find(k => k.startsWith("__reactFiber$"));
    if (!fiberKey) return null;

    let fiber = (node as any)[fiberKey];
    for (let depth = 0; depth < 12 && fiber; depth++, fiber = fiber.return) {
        const id = fiber.memoizedProps?.userId;
        if (typeof id === "string" && id) return id;
    }
    return null;
}

function contents(userId: string) {
    return (
        <>
            {[...renderers.entries()].map(([key, render]) => (
                <ErrorBoundary noop key={key}>
                    {render(userId) as any}
                </ErrorBoundary>
            ))}
        </>
    );
}

function sweep() {
    // Drop anything whose anchor has left the document, or React leaks a root per popout.
    for (const [anchor, entry] of [...mounted]) {
        if (anchor.isConnected) continue;
        try { entry.root.unmount(); } catch { /* already gone */ }
        entry.host.remove();
        mounted.delete(anchor);
    }

    if (!renderers.size) return;

    for (const anchor of document.querySelectorAll<HTMLElement>('[class*="memberSince"]')) {
        const existing = mounted.get(anchor);
        if (existing) {
            existing.root.render(contents(existing.userId));
            continue;
        }

        const userId = fiberUserId(anchor);
        if (!userId) continue;

        const host = document.createElement("div");
        host.className = HOST_CLASS;
        anchor.insertAdjacentElement("afterend", host);

        const root = createRoot(host);
        mounted.set(anchor, { host, root, userId });
        root.render(contents(userId));
    }
}

let observer: MutationObserver | undefined;
let scheduled = false;

function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        try { sweep(); } catch (err) { logger.error("Failed to mount a profile slot", err); }
    });
}

function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
}

/** Tears everything down. Only used when the last consumer goes away. */
export function resetProfileSlots() {
    for (const [, entry] of mounted) {
        try { entry.root.unmount(); } catch { /* already gone */ }
        entry.host.remove();
    }
    mounted.clear();

    if (!renderers.size) {
        observer?.disconnect();
        observer = undefined;
    }
}
