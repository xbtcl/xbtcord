/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { useEffect, useState } from "@webpack/common";

const logger = new Logger("XbtStore");

/**
 * A small persisted record, cached in memory.
 *
 * Plugin settings are the right home for a handful of knobs, but not for user *data* -
 * a list of bookmarks or a pile of reminders would bloat settings.json and get shipped
 * around by settings sync. IndexedDB is where that belongs, and DataStore is already
 * wired up for it.
 *
 * Reads have to be synchronous for React to render off them, so the whole record is
 * loaded once at plugin start and kept in memory; writes go to both.
 */
export class PersistedRecord<T> {
    private cache: Record<string, T> = {};
    private loaded = false;
    private readonly listeners = new Set<() => void>();

    constructor(private readonly key: string) { }

    async load() {
        if (this.loaded) return;
        try {
            this.cache = (await DataStore.get<Record<string, T>>(this.key)) ?? {};
        } catch (err) {
            logger.error(`Couldn't load ${this.key}`, err);
            this.cache = {};
        }
        this.loaded = true;
        this.emit();
    }

    /** Everything, as a plain object. Empty until {@link load} has finished. */
    get all(): Readonly<Record<string, T>> {
        return this.cache;
    }

    get entries(): [string, T][] {
        return Object.entries(this.cache);
    }

    get(id: string): T | undefined {
        return this.cache[id];
    }

    has(id: string): boolean {
        return id in this.cache;
    }

    set(id: string, value: T) {
        this.cache = { ...this.cache, [id]: value };
        this.flush();
    }

    delete(id: string) {
        if (!(id in this.cache)) return;
        const next = { ...this.cache };
        delete next[id];
        this.cache = next;
        this.flush();
    }

    clear() {
        this.cache = {};
        this.flush();
    }

    private flush() {
        this.emit();
        DataStore.set(this.key, this.cache).catch(err => logger.error(`Couldn't save ${this.key}`, err));
    }

    private emit() {
        for (const listener of this.listeners) {
            try { listener(); } catch (err) { logger.error("Listener threw", err); }
        }
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    }

    /** Re-renders the calling component whenever this record changes. */
    use(): Readonly<Record<string, T>> {
        const [, forceUpdate] = useState(0);
        useEffect(() => this.subscribe(() => forceUpdate(n => n + 1)), []);
        return this.cache;
    }
}

/** Ids that only have to be unique within one browser profile. */
export function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
