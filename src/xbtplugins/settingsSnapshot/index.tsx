/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { exportSettings, importSettings } from "@api/SettingsSync/offline";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import { Alerts, openModal, showToast, Toasts } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

const logger = new Logger("SettingsSnapshot");

interface Snapshot {
    at: number;
    /** The same JSON the built-in backup writes, so a snapshot is restorable by hand too. */
    payload: string;
    reason: string;
}

const snapshots = new PersistedRecord<Snapshot>("Xbtcord_SettingsSnapshots");

const settings = definePluginSettings({
    everyHours: {
        type: OptionType.NUMBER,
        description: "Take one automatically this often, in hours. Zero means manual only",
        default: 24
    },
    keep: {
        type: OptionType.NUMBER,
        description: "How many snapshots to keep before the oldest is dropped",
        default: 10
    }
});

/*
 * DataVault exports everything, including plugin data, for moving between machines. This
 * is the smaller, more frequent thing: a rolling set of settings-only snapshots kept
 * locally, so an experiment that goes wrong is one click away from being undone.
 */
async function take(reason: string) {
    try {
        // Exactly the file the built-in Backup and Restore writes, so a snapshot saved
        // out of here can be restored by that too, and vice versa.
        const payload = await exportSettings({ minify: true });

        snapshots.set(String(Date.now()), { at: Date.now(), payload, reason });

        const limit = Math.max(1, settings.store.keep);
        const sorted = snapshots.entries.sort((a, b) => b[1].at - a[1].at);
        for (const [id] of sorted.slice(limit)) snapshots.delete(id);
    } catch (err) {
        logger.error("Could not take a snapshot", err);
    }
}

function restore(snapshot: Snapshot) {
    Alerts.show({
        title: "Roll back to this snapshot?",
        body: `Your settings and QuickCSS will be replaced with the copy from ${ago(snapshot.at)}. Discord will reload.`,
        confirmText: "Roll back",
        cancelText: "Cancel",
        async onConfirm() {
            try {
                await importSettings(snapshot.payload);
                showToast("Restored - reloading", Toasts.Type.SUCCESS);
                setTimeout(() => location.reload(), 600);
            } catch (err: any) {
                logger.error("Restore failed", err);
                showToast(`Restore failed: ${err?.message ?? err}`, Toasts.Type.FAILURE);
            }
        }
    });
}

function SnapshotsModal(props: any) {
    snapshots.use();

    const entries = snapshots.entries.sort((a, b) => b[1].at - a[1].at);

    return (
        <XbtModal props={props} title="Settings snapshots" subtitle="Local rollback points, kept on this machine">
            <div className="xbt-list">
                {entries.length
                    ? entries.map(([id, snapshot]) => (
                        <Row
                            key={id}
                            title={new Date(snapshot.at).toLocaleString()}
                            meta={`${snapshot.reason} - ${Math.round(snapshot.payload.length / 1024)} KB - ${ago(snapshot.at)}`}
                            actions={[
                                { label: "Roll back", onClick: () => restore(snapshot) },
                                {
                                    label: "Save",
                                    onClick: () => saveFile(new File(
                                        [snapshot.payload],
                                        `xbtcord-snapshot-${new Date(snapshot.at).toISOString().slice(0, 19).replaceAll(":", "-")}.json`,
                                        { type: "application/json" }))
                                },
                                { label: "Delete", danger: true, onClick: () => snapshots.delete(id) }
                            ]}
                        />
                    ))
                    : <Empty>No snapshots yet.</Empty>
                }
            </div>

            <div style={{ marginTop: 12 }}>
                <Button size="small" onClick={() => take("Taken by hand")}>Take one now</Button>
            </div>
        </XbtModal>
    );
}

let timer: ReturnType<typeof setInterval> | undefined;

export default definePlugin({
    name: "SettingsSnapshot",
    description: "Keeps rolling local snapshots of your settings and QuickCSS, so an experiment that goes wrong is one click from undone",
    tags: ["Utility", "Customisation"],
    searchTerms: ["snapshot", "backup", "settings", "restore", "rollback", "quickcss"],
    authors: [Devs.Xbtcord],
    settings,

    toolboxActions: {
        "Settings snapshots": () => openModal(props => <SnapshotsModal {...props} />)
    },

    async start() {
        await snapshots.load();

        const hours = settings.store.everyHours;
        if (!hours) return;

        const newest = snapshots.entries.reduce((max, [, snapshot]) => Math.max(max, snapshot.at), 0);
        if (Date.now() - newest > hours * 3_600_000) take("Automatic");

        timer = setInterval(() => take("Automatic"), Math.max(1, hours) * 3_600_000);
    },

    stop() {
        clearInterval(timer);
    }
});
