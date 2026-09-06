/*
 * Xbtcord, a Discord client mod
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Domains whose whole product is logging whoever opens the link.
 *
 * Worth being precise about what this buys you: your IP address is not something a client
 * can strip. Any server you connect to sees it, because it has to send the reply somewhere.
 * These services are not third-party trackers embedded in a page - they *are* the page you
 * navigate to. So the only defence that actually works is not making the request, which is
 * what this list is for.
 *
 * Each of these fronts a redirector: you land on it, it records your IP, user agent and
 * often your rough location, then bounces you to whatever the sender pretended to link.
 */
export const LOGGER_DOMAINS: readonly string[] = [
    // Grabify and its rotating stable of skins
    "grabify.link",
    "lovebird.guru",
    "dateing.club",
    "otherhalf.life",
    "shrekis.life",
    "headshot.monster",
    "gaming-at-my.best",
    "progaming.monster",
    "yourmy.monster",
    "imageshare.best",
    "screenshare.host",
    "screenshot.best",
    "leakedaccount.com",
    "trulove.guru",
    "dagounet.net",

    // IPLogger and friends
    "iplogger.org",
    "iplogger.com",
    "iplogger.ru",
    "iplogger.co",
    "iplogger.info",
    "iplis.ru",
    "iplo.ru",
    "ipgraber.ru",
    "ipgrabber.ru",
    "02ip.ru",
    "ezstat.ru",
    "2no.co",
    "yip.su",

    // Assorted others that advertise the same thing
    "blasze.tk",
    "blasze.com",
    "whatstheirip.com",
    "stopify.co",
    "cyberlogger.com",
    "ps3cfw.com",
    "quickmessage.io",
    "ipgrab.io"
];

/**
 * Shorteners. Not malicious, but they hide where you are actually going, which is exactly
 * what a logger link needs to survive being pasted in front of people. Off by default,
 * because half of the internet is a bit.ly link and constant prompts train people to click
 * through without reading.
 */
export const SHORTENER_DOMAINS: readonly string[] = [
    "bit.ly", "tinyurl.com", "is.gd", "cutt.ly", "shorturl.at", "t.ly", "rb.gy",
    "ow.ly", "buff.ly", "rebrand.ly", "s.id", "soo.gd", "clck.ru", "shorte.st",
    "adf.ly", "bc.vc", "tiny.cc", "v.gd", "gg.gg", "shorturl.com"
];

/**
 * Brands whose login pages get impersonated often enough to be worth a nudge when a
 * domain looks *almost* like one of them.
 */
export const IMPERSONATED_BRANDS: readonly string[] = [
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "steamcommunity.com",
    "steampowered.com",
    "roblox.com",
    "epicgames.com",
    "riotgames.com",
    "twitch.tv",
    "paypal.com",
    "instagram.com",
    "twitter.com",
    "youtube.com"
];
