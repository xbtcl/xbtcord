<div align="center">

# Xbtcord

**A Discord client mod.**

</div>

---

## What this is

Xbtcord is a fork of [endcord](https://github.com/rootpoii/endcord), which is itself a fork
of [Vencord](https://github.com/Vendicated/Vencord) by Vendicated. Almost all of the code
here — including every one of the ~197 plugins — is their work. Xbtcord is GPL-3.0-or-later,
same as they are.

There is no website, no download page and no official builds. You build it from source.

## Features

* ~197 built-in plugins
* Built-in CSS editor, and BetterDiscord theme support
* Works on every Discord branch (Stable, PTB, Canary)
* Browser support via extension or userscript
* Blocks Discord's analytics and crash reporting
* Optional settings sync (off by default, and it uses Vencord's backend)

## Building

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm build
```

That produces `dist/`. To patch Discord with it, see below.

## Installing into Discord

Injection is not wired up yet. `pnpm inject` still points at endcord's installer releases
and will not work for this fork — it needs either a build of the C# installer in this repo
(`Installer.cs`, `InstallerGUI.cs`) or a script of its own.

Until then, patching is manual: build, then replace `resources/app.asar` in your Discord
install with a folder containing an `index.js` that requires `dist/patcher.js`, having first
renamed the real `app.asar` to `_app.asar`.

## Things to know

**CustomProfile is enabled by default and talks to a third party.** It posts your Discord
user ID and profile data to a shared `kvdb.io` bucket owned by endcord, and sends the ID of
every user whose profile you open. That bucket is readable and writable by anyone who knows
its name. Turn the plugin off, or point it somewhere you control, before relying on this
build for anything private.

**This is a client mod, which is against Discord's Terms of Service.** In practice nobody
has been banned for using one, but that is the situation.

## Credit

Vencord is by [Vendicated](https://github.com/Vendicated) and its contributors — the
copyright headers throughout this repo are theirs and stay that way. If you want to support
the people whose code this is, sponsor [Vencord](https://github.com/sponsors/Vendicated).
