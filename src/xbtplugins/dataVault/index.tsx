/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import * as DataStore from "@api/DataStore";
import { importSettings } from "@api/SettingsSync/offline";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { chooseFile } from "@utils/web";
import { Alerts, Modal, moment, openModal, showToast, Text, Toasts, useEffect, useState } from "@webpack/common";

const logger = new Logger("DataVault");

const FORMAT = 1;

interface Vault {
    /** Kept at the top level and named exactly as the built-in backup names them, so a
     *  file written here can still be restored by Settings > Backup & Restore. */
    settings: any;
    quickCss: string;
    /** The half the built-in backup has never covered. */
    xbtcordData?: Record<string, unknown>;
    /** The smaller half of that: things kept in localStorage rather than IndexedDB. */
    xbtcordLocal?: Record<string, string>;
    xbtcordVaultFormat?: number;
    exportedAt?: string;
}

/*
 * localStorage keys worth carrying.
 *
 * CustomProfile - the profile editor - keeps your presets and per-account profile data in
 * both IndexedDB and localStorage, and reads localStorage first because it is synchronous.
 * Capturing only the IndexedDB copy would restore cleanly onto a fresh install and then do
 * nothing at all on a machine that already had its own localStorage, because the stale copy
 * would win the race. Both are taken, so a restore is unambiguous either way.
 *
 * A prefix list rather than everything: localStorage is mostly Discord's own cache, and
 * hauling that around would bloat the file and risk restoring someone else's session state.
 * The sync API's own bookkeeping keys are deliberately not here - restoring "settings are
 * dirty" or a half-finished sync direction onto another machine causes confusing behaviour.
 */
const LOCAL_PREFIXES = ["XbtcordCP_", "Xbtcord_"];

function collectLocal(): Record<string, string> {
    const out: Record<string, string> = {};

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !LOCAL_PREFIXES.some(p => key.startsWith(p))) continue;

            const value = localStorage.getItem(key);
            if (value != null) out[key] = value;
        }
    } catch (err) {
        logger.warn("Couldn't read localStorage", err);
    }

    return out;
}

/**
 * What the built-in backup misses.
 *
 * Settings > Backup & Restore saves settings.json and your quick CSS - which plugins are
 * on, and how they are configured. It has never saved what the plugins actually hold,
 * because until this fork there was very little of it. Now there is: saved messages,
 * reminders, notes, bookmarks, timezones, drafts, voice totals, name history. All of that
 * lives in IndexedDB and would be gone on a reinstall.
 *
 * So this writes a superset. The settings and quickCss keys keep their original names and
 * shape, which means a file from here restores fine through the built-in importer too -
 * it just ignores the extra key.
 */
async function collectData(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};

    for (const key of await DataStore.keys()) {
        if (typeof key !== "string") continue;

        try {
            const value = await DataStore.get(key);
            // Round-trip through JSON here rather than at write time, so one unserialisable
            // entry is skipped instead of failing the whole export.
            JSON.stringify(value);
            out[key] = value;
        } catch (err) {
            logger.warn(`Skipping ${key} - it doesn't survive JSON`, err);
        }
    }

    return out;
}

export async function exportVault(): Promise<string> {
    const vault: Vault = {
        settings: XbtcordNative.settings.get(),
        quickCss: await XbtcordNative.quickCss.get(),
        xbtcordData: await collectData(),
        xbtcordLocal: collectLocal(),
        xbtcordVaultFormat: FORMAT,
        exportedAt: new Date().toISOString()
    };

    return JSON.stringify(vault, null, 4);
}

async function download() {
    try {
        const text = await exportVault();
        const filename = `xbtcord-vault-${moment().format("YYYY-MM-DD")}.json`;
        const bytes = new TextEncoder().encode(text);

        if (IS_DISCORD_DESKTOP) {
            DiscordNative.fileManager.saveWithDialog(bytes, filename);
        } else {
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        showToast("Exported everything", Toasts.Type.SUCCESS);
    } catch (err) {
        logger.error("Export failed", err);
        showToast("Couldn't export", Toasts.Type.FAILURE);
    }
}

async function applyVault(text: string, restoreData: boolean) {
    const parsed = JSON.parse(text) as Vault;

    if (!parsed || typeof parsed !== "object" || !("settings" in parsed)) {
        throw new Error("That doesn't look like an Xbtcord backup.");
    }

    // The settings half goes through the built-in importer, which already does the
    // prototype-pollution check and writes through the native side. No reason to
    // reimplement any of that here.
    await importSettings(JSON.stringify({
        settings: parsed.settings,
        quickCss: parsed.quickCss ?? ""
    }));

    if (!restoreData) return;

    let restored = 0;
    for (const [key, value] of Object.entries(parsed.xbtcordData ?? {})) {
        try {
            await DataStore.set(key, value);
            restored++;
        } catch (err) {
            logger.warn(`Couldn't restore ${key}`, err);
        }
    }

    // localStorage after IndexedDB: CustomProfile prefers this copy, so it has to be the
    // one that ends up authoritative rather than a stale value left behind.
    for (const [key, value] of Object.entries(parsed.xbtcordLocal ?? {})) {
        if (!LOCAL_PREFIXES.some(p => key.startsWith(p))) continue;
        try {
            localStorage.setItem(key, value);
            restored++;
        } catch (err) {
            logger.warn(`Couldn't restore ${key}`, err);
        }
    }

    logger.info(`Restored ${restored} entries`);
}

async function upload() {
    try {
        let text: string | null = null;

        if (IS_DISCORD_DESKTOP) {
            const [file] = await DiscordNative.fileManager.openFiles({
                filters: [
                    { name: "Xbtcord backup", extensions: ["json"] },
                    { name: "all", extensions: ["*"] }
                ]
            });
            if (!file) return;
            text = new TextDecoder().decode(file.data);
        } else {
            const file = await chooseFile("application/json");
            if (!file) return;
            text = await file.text();
        }

        const parsed = JSON.parse(text!) as Vault;
        const entries = Object.keys(parsed.xbtcordData ?? {}).length + Object.keys(parsed.xbtcordLocal ?? {}).length;

        Alerts.show({
            title: "Restore this backup?",
            body: (
                <>
                    <p>
                        This replaces your current settings
                        {entries > 0 ? ` and ${entries} plugin data entries` : ""} with the ones
                        in the file.
                    </p>
                    {entries === 0 && (
                        <p style={{ marginTop: 8 }}>
                            This file has no plugin data in it - it's a settings-only backup, so
                            saved messages, notes and the rest are left alone.
                        </p>
                    )}
                    <p style={{ marginTop: 8 }}>Discord has to restart afterwards.</p>
                </>
            ),
            confirmText: "Restore",
            cancelText: "Cancel",
            onConfirm: async () => {
                try {
                    await applyVault(text!, true);
                    showToast("Restored. Restart Discord to apply.", Toasts.Type.SUCCESS);
                } catch (err) {
                    logger.error("Import failed", err);
                    showToast(`Couldn't restore: ${String(err)}`, Toasts.Type.FAILURE);
                }
            }
        });
    } catch (err) {
        logger.error("Import failed", err);
        showToast(`Couldn't read that file: ${String(err)}`, Toasts.Type.FAILURE);
    }
}

function VaultPanel() {
    const [summary, setSummary] = useState<{ keys: number; bytes: number; } | null>(null);

    useEffect(() => {
        collectData()
            .then(data => {
                const local = collectLocal();
                setSummary({
                    keys: Object.keys(data).length + Object.keys(local).length,
                    bytes: JSON.stringify(data).length + JSON.stringify(local).length
                });
            })
            .catch(err => logger.error("Couldn't size the vault", err));
    }, []);

    return (
        <>
            <div className="xbt-form">
                <Text variant="text-sm/normal">
                    Saves your settings, your quick CSS <b>and</b> everything the plugins hold -
                    saved messages, reminders, notes, bookmarks, timezones, drafts and the rest.
                </Text>
                <Text variant="text-xs/normal" className="xbt-row-meta">
                    {summary
                        ? `${summary.keys} data entries, about ${Math.max(1, Math.round(summary.bytes / 1024))} KB`
                        : "Measuring…"}
                    {" · "}Settings &gt; Backup &amp; Restore saves the settings half only.
                </Text>
                <div className="xbt-form-row">
                    <div />
                    <Button size="small" onClick={download}>Export everything</Button>
                    <Button size="small" variant="secondary" onClick={upload}>Import a backup</Button>
                </div>
            </div>
        </>
    );
}

function open() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Backup and restore"
                subtitle="Everything, not just the settings"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <VaultPanel />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "DataVault",
    description: "Export and import everything - settings, quick CSS, and the data your plugins hold",
    tags: ["Utility", "Organisation"],
    searchTerms: ["backup", "restore", "export", "import", "save", "sync", "cloud", "json", "migrate"],
    authors: [Devs.Xbtcord],
    enabledByDefault: true,

    settingsAboutComponent: () => (
        <ErrorBoundary noop>
            <VaultPanel />
        </ErrorBoundary>
    ),

    toolboxActions: {
        "Backup and restore": open
    }
});
