/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { NotesIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";

import { findSnippet, openSnippetsModal, recordUse, saveSnippet, snippets } from "./snippets";

export default definePlugin({
    name: "Snippets",
    description: "Save the messages you retype constantly and fire them off with /snippet",
    tags: ["Chat", "Shortcuts", "Commands"],
    searchTerms: ["snippet", "canned", "template", "macro", "shortcut", "reply"],
    authors: [Devs.Xbtcord],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "snippet",
            description: "Send one of your saved snippets",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "name",
                    description: "Which snippet",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const snippet = findSnippet(findOption(args, "name", ""));
                if (!snippet) {
                    const known = Object.keys(snippets.all).join(", ") || "none saved yet";
                    sendBotMessage(ctx.channel.id, { content: `No snippet by that name. You have: ${known}` });
                    return;
                }

                recordUse(snippet);
                return { content: snippet.content };
            }
        },
        {
            name: "snippet-save",
            description: "Save a new snippet, or overwrite one you already have",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "name",
                    description: "Short name you will type later",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "text",
                    description: "What it expands to",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const name = findOption(args, "name", "");
                const text = findOption(args, "text", "");

                if (!name.trim() || !text.trim()) {
                    sendBotMessage(ctx.channel.id, { content: "Both a name and some text, please." });
                    return;
                }

                saveSnippet(name, text);
                sendBotMessage(ctx.channel.id, { content: `Saved. Use it with \`/snippet name:${name.trim()}\`.` });
            }
        },
        {
            name: "snippets",
            description: "Open the snippet manager",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute() {
                openSnippetsModal();
            }
        }
    ],

    contextMenus: {
        "textarea-context": children => {
            children.push(
                <Menu.MenuItem
                    id="xbt-snippets"
                    label="Snippets"
                    icon={NotesIcon}
                    action={openSnippetsModal}
                />
            );
        }
    },

    toolboxActions: {
        "Snippets": openSnippetsModal
    },

    start: () => snippets.load()
});
