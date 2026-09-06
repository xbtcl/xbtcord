/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Modal, openModal, Text } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";
import { describeChannel, jumpToMessage } from "@xbtplugins/_shared/util";

const logger = new Logger("DraftKeeper");

interface Draft {
    channelId: string;
    channelName: string;
    content: string;
    at: number;
}

const drafts = new PersistedRecord<Draft>("Xbtcord_Drafts");

const settings = definePluginSettings({
    keepDays: {
        type: OptionType.NUMBER,
        description: "Forget saved drafts after this many days",
        default: 14
    },
    minLength: {
        type: OptionType.NUMBER,
        description: "Don't bother saving drafts shorter than this",
        default: 20
    }
});

/**
 * A second copy of your unsent text, kept outside Discord's own draft store.
 *
 * Discord does persist drafts, but it drops them on a reinstall, on switching accounts,
 * and sometimes on a hard crash - which are exactly the moments a long unsent message is
 * most annoying to lose. This never deletes anything Discord holds; it only keeps a copy
 * that outlives those events, and the copy never leaves this machine.
 */
function remember(channelId: string, content: string) {
    try {
        if (!channelId) return;

        const text = content?.trim() ?? "";

        if (text.length < Math.max(1, settings.store.minLength)) {
            // Clearing the box means the draft is done with, one way or the other.
            if (drafts.has(channelId) && !text) drafts.delete(channelId);
            return;
        }

        drafts.set(channelId, {
            channelId,
            channelName: describeChannel(channelId),
            content: text,
            at: Date.now()
        });
    } catch (err) {
        logger.error("Couldn't save a draft", err);
    }
}

function prune() {
    const cutoff = Date.now() - Math.max(1, settings.store.keepDays) * 86_400_000;
    for (const [id, draft] of drafts.entries) {
        if (draft.at < cutoff) drafts.delete(id);
    }
}

function DraftList({ close }: { close(): void; }) {
    const all = drafts.use();
    const rows = Object.values(all).sort((a, b) => b.at - a.at);

    if (!rows.length) {
        return <div className="xbt-empty">Nothing saved. Type something and leave it unsent.</div>;
    }

    return (
        <div className="xbt-list">
            {rows.map(draft => (
                <div className="xbt-row" key={draft.channelId}>
                    <div className="xbt-row-body">
                        <Text variant="text-sm/semibold">{draft.channelName}</Text>
                        <Text variant="text-sm/normal" className="xbt-row-preview">{draft.content}</Text>
                        <Text variant="text-xs/normal" className="xbt-row-meta">
                            {new Date(draft.at).toLocaleString()}
                        </Text>
                    </div>
                    <div className="xbt-row-actions">
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => { jumpToMessage(draft.channelId); close(); }}
                        >
                            Go
                        </Button>
                        <Button
                            size="small"
                            variant="secondary"
                            onClick={() => copyWithToast(draft.content, "Draft copied")}
                        >
                            Copy
                        </Button>
                        <Button
                            size="small"
                            variant="dangerSecondary"
                            onClick={() => drafts.delete(draft.channelId)}
                        >
                            Forget
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function open() {
    openModal(props => (
        <ErrorBoundary>
            <Modal
                {...props}
                title="Saved drafts"
                subtitle="Unsent text, kept where a reinstall can't reach it"
                size="md"
                actions={[{ text: "Close", variant: "primary", onClick: props.onClose }]}
            >
                <DraftList close={props.onClose} />
            </Modal>
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "DraftKeeper",
    description: "Keeps a copy of your unsent messages, so a reinstall or a crash doesn't eat them",
    tags: ["Chat", "Utility"],
    searchTerms: ["draft", "unsent", "recover", "backup", "lost"],
    authors: [Devs.Xbtcord],
    settings,

    flux: {
        DRAFT_SAVE({ channelId, draft }: { channelId: string; draft: string; }) {
            remember(channelId, draft);
        },
        DRAFT_CHANGE({ channelId, draft }: { channelId: string; draft: string; }) {
            remember(channelId, draft);
        },
        // A sent message in that channel means the draft went out.
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic?: boolean; }) {
            if (optimistic && message?.channel_id) drafts.delete(message.channel_id);
        }
    },

    toolboxActions: {
        "Saved drafts": open
    },

    async start() {
        await drafts.load();
        prune();
    }
});
