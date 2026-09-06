<div align="center">

# Xbtcord

**A Discord client mod.**

</div>

---

## What this is

Xbtcord is a fork of [endcord](https://github.com/rootpoii/endcord), which is itself a fork
of [Vencord](https://github.com/Vendicated/Vencord) by Vendicated. Almost all of the code
here — including the great majority of the plugins — is their work. Xbtcord is
GPL-3.0-or-later, same as they are.

## Installing

Grab **XbtcordInstaller.exe** from
[the latest release](https://github.com/xbtcl/xbtcord/releases/latest) and run it.

It finds every Discord branch you have installed, downloads the current build, and patches
it. No administrator rights are needed — Discord lives in your own `%LOCALAPPDATA%`, and
nothing outside it is touched. The same window uninstalls again, which is a single rename
back, and restores your shortcut icons.

If Windows SmartScreen warns you about an unrecognised app: that is expected. The exe is
unsigned, because a code-signing certificate costs a few hundred pounds a year. Build it
yourself from `installer/` if you would rather not take that on faith.

## Features

* 340+ built-in plugins, including 20 written for this fork
* Filter the plugin list by which project a plugin came from — Vencord, Equicord, endcord
  or Xbtcord — each marked with that project's own logo
* Theme Vault: browse and apply BetterDiscord themes without leaving Discord
* Built-in CSS editor and BetterDiscord theme support
* Works on every Discord branch (Stable, PTB, Canary)
* Browser support via extension or userscript
* Blocks Discord's analytics and crash reporting

### Plugins written for this fork

| Plugin | What it does |
| --- | --- |
| MessageReminders | Snooze a message; a notification later takes you straight back to it |
| SavedMessages | Bookmark messages into your own collections and search them |
| ScheduledMessages | Write a message now, send it later with `/schedule` |
| Snippets | Saved canned replies, fired off with `/snippet` |
| KeywordAlerts | Get notified when a word you care about is said anywhere you can read |
| LinkGuard | Warns before opening known IP loggers and lookalike domains |
| QuickNotes | A private scratchpad per channel, per server, and one for everything |
| BlockedWords | Hides messages containing words you would rather not read |
| GhostPingDetector | Tells you when a ping was deleted or edited away |
| SelfDestruct | Send a message that deletes itself after a set time |
| Timezones | Note someone's timezone, see their local time on their messages |
| StatusSchedule | Switch your status automatically at times you choose |
| EmojiStats | Counts which emoji you actually use |
| FriendVoiceAlerts | Get notified when specific people join a voice call |
| MediaVolume | Embedded video starts at your volume, not full blast |
| ReplyChainViewer | Expands the whole chain of replies above a message |
| LocalSearch | Search loaded messages with real regex and case sensitivity |
| FocusMode | One switch that strips Discord back to the conversation |
| AccountAge | Shows when an account was made, flags brand new ones |
| NoQuests | Hides the Quest bars, badges and popups |

Most of these avoid webpack patches entirely and build on the APIs the fork already has, so
they keep working across Discord updates rather than breaking on the next redesign.

## Building

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm build
```

That produces `dist/`. To patch your own Discord with it, put the installer exe next to that
`dist/` folder — it prefers a local build over downloading one — or use the PowerShell
script, which links Discord straight at the repo so a rebuild lands on the next restart:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/installer/xbtcord-install.ps1 -Dev
```

### Building the installer

The installer is a single-file Win32 app in `installer/`, with no dependencies beyond what
ships with Windows. It builds with either MSVC or MinGW:

```powershell
./installer/build.ps1 -Repo xbtcl/xbtcord
```

`-Repo` is baked into the exe and decides where it downloads builds from. CI passes the
repository it is running in, so a fork's installer automatically points at that fork.

## Things to know

**CustomProfile is enabled by default and talks to a third party.** It posts your Discord
user ID and profile data to a shared `kvdb.io` bucket owned by endcord, and sends the ID of
every user whose profile you open. That bucket is readable and writable by anyone who knows
its name. Turn the plugin off, or point it somewhere you control, before relying on this
build for anything private.

**LinkGuard cannot hide your IP address.** It refuses to open known logger domains without
asking first, which is the only thing that actually helps — once you connect to any server,
it has your address, and no client can change that. It is a prompt before you connect, not
a shield after.

**This is a client mod, which is against Discord's Terms of Service.** In practice nobody
has been banned for using one, but that is the situation.

## Credit

Vencord is by [Vendicated](https://github.com/Vendicated) and its contributors — the
copyright headers throughout this repo are theirs and stay that way. If you want to support
the people whose code this is, sponsor [Vencord](https://github.com/sponsors/Vendicated).

Equicord and endcord logos are used only to mark which project a plugin came from, and
belong to their respective projects.
