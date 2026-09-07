/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { Button } from "@components/Button";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import definePlugin from "@utils/types";
import { saveFile } from "@utils/web";
import { ChannelStore, GuildStore, openModal, RelationshipStore, showToast, Toasts, UserStore } from "@webpack/common";
import { Empty, Row, XbtModal } from "@xbtplugins/_shared/ui";

/*
 * Discord's own data request takes up to 30 days and arrives as an unreadable pile of
 * JSON. This is the small, immediately useful part of it: the servers you are in and the
 * people you know, in a file you can actually read.
 *
 * Deliberately no messages, no tokens and no email address - none of that is needed to
 * answer "which servers was I in" after losing an account, and all of it is dangerous to
 * have sitting in a file.
 */
interface Snapshot {
    exportedAt: string;
    account: { id: string; username: string; globalName?: string; };
    guilds: { id: string; name: string; owner: boolean; }[];
    friends: { id: string; username: string; nickname?: string; }[];
    groupDms: { id: string; name: string; members: number; }[];
}

function build(): Snapshot {
    const me = UserStore.getCurrentUser();

    const guilds = Object.values(GuildStore.getGuilds() ?? {}).map((guild: any) => ({
        id: guild.id,
        name: guild.name,
        owner: guild.ownerId === me?.id
    })).sort((a, b) => a.name.localeCompare(b.name));

    // getFriendIDs is already only mutual friends - pending, blocked and implicit
    // relationships live in their own lists, and none of those belong here.
    const friends = (RelationshipStore.getFriendIDs() ?? [])
        .map(id => {
            const user = UserStore.getUser(id);
            return {
                id,
                username: user?.username ?? "unknown",
                nickname: RelationshipStore.getNickname(id) || undefined
            };
        })
        .sort((a, b) => a.username.localeCompare(b.username));

    const groupDms = Object.values(ChannelStore.getMutablePrivateChannels?.() ?? {})
        .filter((channel: any) => channel?.type === 3)
        .map((channel: any) => ({
            id: channel.id,
            name: channel.name || channel.rawRecipients?.map((r: any) => r.username).join(", ") || "unnamed",
            members: channel.recipients?.length ?? 0
        }));

    return {
        exportedAt: new Date().toISOString(),
        account: { id: me?.id ?? "", username: me?.username ?? "", globalName: (me as any)?.globalName },
        guilds,
        friends,
        groupDms
    };
}

function ExportModal(props: any) {
    const snapshot = build();

    return (
        <XbtModal
            props={props}
            title="Account snapshot"
            subtitle="Servers, friends and group DMs. No messages, no email, no token"
        >
            <div className="xbt-list">
                <Row title={`${snapshot.guilds.length} servers`} meta={`${snapshot.guilds.filter(g => g.owner).length} of them yours`} />
                <Row title={`${snapshot.friends.length} friends`} />
                <Row title={`${snapshot.groupDms.length} group DMs`} />
                {!snapshot.guilds.length && !snapshot.friends.length && <Empty>Nothing loaded yet - give the client a moment.</Empty>}
            </div>

            <div className="xbt-form-row" style={{ marginTop: 12 }}>
                <Button
                    onClick={() => {
                        const json = JSON.stringify(snapshot, null, 2);
                        const file = new File([json], `xbtcord-account-${snapshot.exportedAt.slice(0, 10)}.json`, { type: "application/json" });
                        saveFile(file);
                        showToast("Saved", Toasts.Type.SUCCESS);
                    }}
                >
                    Save as JSON
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => copyWithToast(
                        snapshot.guilds.map(guild => guild.name).join("\n"),
                        "Server list copied")}
                >
                    Copy the server list
                </Button>
            </div>
        </XbtModal>
    );
}

export default definePlugin({
    name: "AccountExport",
    description: "Writes out the servers you are in and the people you know as a readable JSON file, without waiting a month for a data request",
    tags: ["Utility", "Privacy", "Organisation"],
    searchTerms: ["export", "backup", "account", "servers", "friends", "json", "data"],
    authors: [Devs.Xbtcord],

    toolboxActions: {
        "Account snapshot": () => openModal(props => <ExportModal {...props} />)
    }
});
