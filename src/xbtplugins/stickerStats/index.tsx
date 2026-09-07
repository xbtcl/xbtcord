/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { openModal, UserStore } from "@webpack/common";
import { Message } from "@xbtcord/discord-types";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { ago, Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

interface Use {
    name: string;
    count: number;
    lastUsed: number;
    /** Whether it was you or someone else. Counted separately, they answer different questions. */
    mine: boolean;
}

const uses = new PersistedRecord<Use>("Xbtcord_StickerStats");

const settings = definePluginSettings({
    trackOthers: {
        type: OptionType.BOOLEAN,
        description: "Also count stickers other people send",
        default: true
    }
});

function record(sticker: any, mine: boolean) {
    const id = `${mine ? "me" : "them"}:${sticker.id}`;
    const existing = uses.get(id);

    uses.set(id, {
        name: sticker.name ?? "unnamed",
        count: (existing?.count ?? 0) + 1,
        lastUsed: Date.now(),
        mine
    });
}

function StatsModal(props: any) {
    uses.use();

    const mine = uses.entries.filter(([, use]) => use.mine).sort((a, b) => b[1].count - a[1].count);
    const theirs = uses.entries.filter(([, use]) => !use.mine).sort((a, b) => b[1].count - a[1].count);

    function section(title: string, entries: [string, Use][]) {
        if (!entries.length) return null;
        return (
            <>
                <div className="xbt-row-meta" style={{ margin: "12px 0 6px" }}>{title}</div>
                <div className="xbt-list">
                    {entries.slice(0, 25).map(([id, use]) => (
                        <Row
                            key={id}
                            title={use.name}
                            meta={`${use.count} time${use.count === 1 ? "" : "s"} - last ${ago(use.lastUsed)}`}
                        />
                    ))}
                </div>
            </>
        );
    }

    return (
        <XbtModal props={props} title="Sticker stats" subtitle="EmojiStats does emoji. This one does the other half">
            {mine.length || theirs.length
                ? (
                    <>
                        {section("Yours", mine)}
                        {section("Everyone else", theirs)}
                        <div style={{ marginTop: 12 }}>
                            <Button size="small" variant="dangerPrimary" onClick={() => uses.clear()}>Reset</Button>
                        </div>
                    </>
                )
                : <Empty>No stickers seen yet.</Empty>
            }
        </XbtModal>
    );
}

export default definePlugin({
    name: "StickerStats",
    description: "Counts which stickers get used, yours and everyone elses, so you know which ones are worth keeping",
    tags: ["Utility", "Emotes"],
    searchTerms: ["sticker", "stats", "count", "usage", "favourite"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean; }) {
            if (optimistic || !message?.id) return;

            const stickers = (message as any).sticker_items ?? (message as any).stickers;
            if (!stickers?.length) return;

            const mine = message.author?.id === UserStore.getCurrentUser()?.id;
            if (!mine && !settings.store.trackOthers) return;

            for (const sticker of stickers) record(sticker, mine);
        }
    },

    toolboxActions: {
        "Sticker stats": () => openModal(props => <StatsModal {...props} />)
    },

    start: () => uses.load()
});
