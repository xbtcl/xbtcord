/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PaintbrushIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";
import { PersistedRecord } from "@xbtplugins/_shared/store";

const colours = new PersistedRecord<string>("Xbtcord_ChannelColors");

const PALETTE: [string, string][] = [
    ["Red", "#ed4245"],
    ["Orange", "#e67e22"],
    ["Yellow", "#f1c40f"],
    ["Green", "#3ba55c"],
    ["Blue", "#3498db"],
    ["Purple", "#9b59b6"],
    ["Pink", "#eb459e"],
    ["Grey", "#95a5a6"]
];

const STYLE_ID = "xbt-channel-colors";

/*
 * Written as one stylesheet rather than by walking the DOM.
 *
 * The sidebar virtualises - channels are created and destroyed as you scroll - so any
 * approach that colours elements directly has to keep re-running. A stylesheet keyed on
 * the data attribute Discord already puts on each row colours them the moment they
 * appear, and costs nothing while you scroll.
 *
 * `data-list-item-id` ends in the channel id, which is why the selector is a suffix
 * match: the prefix in front of it changes with the list the row belongs to.
 */
function render() {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

    if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }

    style.textContent = colours.entries.map(([channelId, colour]) => `
        [data-list-item-id$="_${channelId}"] {
            border-left: 3px solid ${colour};
            border-radius: 4px;
        }
    `).join("\n");
}

function remove() {
    document.getElementById(STYLE_ID)?.remove();
}

export default definePlugin({
    name: "ChannelColors",
    description: "Colour codes channels in the sidebar so the ones you care about stand out from the wall of text",
    tags: ["Appearance", "Organisation", "Customisation"],
    searchTerms: ["channel", "colour", "color", "sidebar", "highlight", "organise"],
    authors: [Devs.Xbtcord],

    contextMenus: {
        "channel-context": (children, { channel }: { channel?: { id: string; }; }) => {
            if (!channel) return;

            const current = colours.get(channel.id);

            children.push(
                <Menu.MenuItem id="xbt-channel-colour" label="Colour" icon={PaintbrushIcon}>
                    {PALETTE.map(([name, hex]) => (
                        <Menu.MenuItem
                            key={hex}
                            id={`xbt-channel-colour-${hex}`}
                            label={current === hex ? `${name} (current)` : name}
                            action={() => { colours.set(channel.id, hex); render(); }}
                        />
                    ))}
                    {!!current && (
                        <Menu.MenuItem
                            id="xbt-channel-colour-clear"
                            label="No colour"
                            action={() => { colours.delete(channel.id); render(); }}
                        />
                    )}
                </Menu.MenuItem>
            );
        }
    },

    async start() {
        await colours.load();
        render();
    },

    stop: remove
});
