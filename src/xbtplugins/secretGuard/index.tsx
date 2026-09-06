/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Alerts } from "@webpack/common";

const settings = definePluginSettings({
    checkTokens: {
        type: OptionType.BOOLEAN,
        description: "Warn about things shaped like a Discord token",
        default: true
    },
    checkKeys: {
        type: OptionType.BOOLEAN,
        description: "Warn about things shaped like an API key (AWS, GitHub, OpenAI, Stripe, private keys)",
        default: true
    },
    checkEmails: {
        type: OptionType.BOOLEAN,
        description: "Warn about email addresses",
        default: false
    }
});

interface Rule {
    name: string;
    pattern: RegExp;
    enabled(): boolean;
}

/*
 * Shapes worth stopping on.
 *
 * Deliberately narrow. A pattern that fires on ordinary chat gets clicked through without
 * reading within a day, at which point it protects nobody - so these all match a structure
 * that does not occur by accident, and anything merely suspicious is left alone.
 */
const RULES: Rule[] = [
    {
        name: "a Discord token",
        // id.timestamp.hmac - the three base64 segments Discord tokens are built from.
        pattern: /\b[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,40}\b/,
        enabled: () => settings.store.checkTokens
    },
    {
        name: "a Discord bot token",
        pattern: /\bmfa\.[\w-]{80,100}\b/i,
        enabled: () => settings.store.checkTokens
    },
    {
        name: "a GitHub token",
        pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
        enabled: () => settings.store.checkKeys
    },
    {
        name: "an AWS access key",
        pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
        enabled: () => settings.store.checkKeys
    },
    {
        name: "an OpenAI key",
        pattern: /\bsk-[A-Za-z0-9-_]{20,}\b/,
        enabled: () => settings.store.checkKeys
    },
    {
        name: "a Stripe key",
        pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}\b/,
        enabled: () => settings.store.checkKeys
    },
    {
        name: "a private key",
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
        enabled: () => settings.store.checkKeys
    },
    {
        name: "an email address",
        pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/,
        enabled: () => settings.store.checkEmails
    }
];

function findSecret(content: string): string | null {
    for (const rule of RULES) {
        if (!rule.enabled()) continue;
        if (rule.pattern.test(content)) return rule.name;
    }
    return null;
}

function confirm(what: string): Promise<boolean> {
    return new Promise(resolve => {
        Alerts.show({
            title: "That looks like a secret",
            body: (
                <>
                    <p>This message contains what looks like <b>{what}</b>.</p>
                    <p style={{ marginTop: 8 }}>
                        If that is real, sending it here hands it to everyone who can read this
                        channel, and to Discord's logs. Tokens and keys cannot be un-sent -
                        deleting the message does not un-leak them, only rotating them does.
                    </p>
                </>
            ),
            confirmText: "Send anyway",
            cancelText: "Don't send",
            onConfirm: () => resolve(false),
            onCancel: () => resolve(true),
            onCloseCallback: () => resolve(true)
        });
    });
}

export default definePlugin({
    name: "SecretGuard",
    description: "Stops you before you paste a token, API key or private key into a chat",
    tags: ["Privacy", "Utility", "Chat"],
    searchTerms: ["token", "secret", "key", "leak", "password", "credential"],
    authors: [Devs.Xbtcord],
    settings,

    async onBeforeMessageSend(_channelId, message) {
        const what = findSecret(message.content);
        if (!what) return;

        if (await confirm(what)) return { cancel: true };
    },

    async onBeforeMessageEdit(_channelId, _messageId, message) {
        const what = findSecret(message.content);
        if (!what) return;

        if (await confirm(what)) return { cancel: true };
    }
});
