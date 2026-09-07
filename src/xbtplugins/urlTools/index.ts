/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { makeCodeblock } from "@utils/text";
import definePlugin from "@utils/types";

/**
 * Pulls a URL apart into the pieces people actually want to look at.
 *
 * ClearURLs already strips tracking parameters on the way out. This is the read-only
 * counterpart: it tells you what is in a link somebody sent you, without opening it.
 */
function inspect(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new Error("That is not a URL this browser can parse.");
    }

    const lines = [
        `scheme    ${url.protocol.replace(":", "")}`,
        `host      ${url.hostname}`,
        url.port ? `port      ${url.port}` : "",
        `path      ${decodeURIComponent(url.pathname)}`,
        url.hash ? `fragment  ${decodeURIComponent(url.hash.slice(1))}` : ""
    ].filter(Boolean);

    const params = [...url.searchParams.entries()];
    if (params.length) {
        lines.push("", "query");
        for (const [key, value] of params) lines.push(`  ${key} = ${value}`);
    }

    return lines.join("\n");
}

export default definePlugin({
    name: "UrlTools",
    description: "Encodes, decodes and takes apart URLs, so you can read what is inside a link before you click it",
    tags: ["Utility", "Privacy", "Developers"],
    searchTerms: ["url", "encode", "decode", "percent", "query", "link", "inspect"],
    authors: [Devs.Xbtcord],

    commands: [
        {
            name: "urlencode",
            description: "Percent-encode some text and copy it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "What to encode",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                const encoded = encodeURIComponent(findOption(args, "text", ""));
                copyWithToast(encoded, "Encoded and copied");
                sendBotMessage(ctx.channel.id, { content: makeCodeblock(encoded) });
            }
        },
        {
            name: "urldecode",
            description: "Decode percent-encoded text and copy it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "What to decode",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                let decoded: string;
                try {
                    decoded = decodeURIComponent(findOption(args, "text", ""));
                } catch {
                    throw new Error("That is not valid percent-encoding - there is a stray % in there.");
                }

                copyWithToast(decoded, "Decoded and copied");
                sendBotMessage(ctx.channel.id, { content: makeCodeblock(decoded) });
            }
        },
        {
            name: "urlinspect",
            description: "Break a URL into its parts, shown only to you",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "url",
                    description: "The link to look at",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute(args, ctx) {
                sendBotMessage(ctx.channel.id, { content: makeCodeblock(inspect(findOption(args, "url", ""))) });
            }
        }
    ]
});
