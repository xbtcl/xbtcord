/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "@xbtplugins/_shared/xbt.css";

import { PaintbrushIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { copyWithToast, getCurrentGuild } from "@utils/discord";
import definePlugin from "@utils/types";
import { GuildRoleStore, Menu, openModal } from "@webpack/common";
import { Empty, XbtModal } from "@xbtplugins/_shared/ui";

interface Swatch {
    id: string;
    name: string;
    hex: string;
    position: number;
}

/** Discord stores role colours as a packed integer; zero means "no colour set". */
function swatches(guildId: string): Swatch[] {
    const roles = GuildRoleStore.getSortedRoles(guildId) ?? [];

    return (roles as any[])
        .filter(role => role.color)
        .map(role => ({
            id: role.id,
            name: role.name,
            position: role.position,
            hex: `#${role.color.toString(16).padStart(6, "0")}`
        }))
        .sort((a, b) => b.position - a.position);
}

function PaletteModal({ guildId, guildName, ...props }: { guildId: string; guildName: string; } & any) {
    const colours = swatches(guildId);

    return (
        <XbtModal
            props={props}
            title={`${guildName} palette`}
            subtitle={colours.length ? "Click one to copy its hex" : undefined}
        >
            {colours.length
                ? (
                    <>
                        <div className="xbt-palette">
                            {colours.map(colour => (
                                <button
                                    key={colour.id}
                                    className="xbt-palette-swatch"
                                    style={{ background: colour.hex }}
                                    title={`${colour.name} - ${colour.hex}`}
                                    onClick={() => copyWithToast(colour.hex, `${colour.hex} copied`)}
                                >
                                    <span className="xbt-palette-name">{colour.name}</span>
                                    <span className="xbt-palette-hex">{colour.hex}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            className="xbt-palette-copy-all"
                            onClick={() => copyWithToast(
                                colours.map(colour => `${colour.hex} /* ${colour.name} */`).join("\n"),
                                "Copied the whole palette")}
                        >
                            Copy all as CSS
                        </button>
                    </>
                )
                : <Empty>No role in this server has a colour set.</Empty>
            }
        </XbtModal>
    );
}

function open(guildId: string, guildName: string) {
    openModal(props => <PaletteModal {...props} guildId={guildId} guildName={guildName} />);
}

export default definePlugin({
    name: "RolePalette",
    description: "Shows every coloured role in a server as a palette you can copy hex codes out of, for themes and graphics",
    tags: ["Utility", "Roles", "Appearance"],
    searchTerms: ["role", "colour", "color", "palette", "hex", "theme", "swatch"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "guild-context": (children, { guild }: { guild?: { id: string; name: string; }; }) => {
            if (!guild) return;
            children.push(
                <Menu.MenuItem
                    id="xbt-role-palette"
                    label="Role palette"
                    icon={PaintbrushIcon}
                    action={() => open(guild.id, guild.name)}
                />
            );
        }
    },

    toolboxActions: {
        "Role palette": () => {
            const guild = getCurrentGuild();
            if (guild) open(guild.id, guild.name);
        }
    }
});
