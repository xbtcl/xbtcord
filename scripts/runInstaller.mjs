/*
 * Xbtcord, a modification for Discord's desktop app
 * Copyright (c) 2026 Xbtcord and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * `pnpm inject` / `pnpm uninject`.
 *
 * This used to download a prebuilt installer from endcord's releases, which this fork has
 * no equivalent of - the URL 404s. It now drives the PowerShell installer in this repo
 * instead, in dev mode: Discord is pointed straight at `dist/`, so a `pnpm build` takes
 * effect on the next Discord restart with no reinstall.
 *
 * That is the right tool for a working copy. The GUI installer in `installer/` is the one
 * for everybody else - it copies a snapshot rather than linking a folder that might be
 * mid-rebuild.
 */

import "./checkNodeVersion.js";

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(BASE_DIR, "scripts", "installer", "xbtcord-install.ps1");

const uninstall = process.argv.includes("--uninstall");

if (process.platform !== "win32") {
    console.error(
        "This fork only ships a Windows installer.\n\n" +
        "On Linux or macOS, patch Discord by hand: rename `resources/app.asar` to\n" +
        "`_app.asar`, then create an `app.asar` folder next to it containing a\n" +
        "package.json of {\"name\":\"discord\",\"main\":\"index.js\"} and an index.js that\n" +
        `requires ${join(BASE_DIR, "dist", "patcher.js")}.`
    );
    process.exit(1);
}

if (!existsSync(SCRIPT)) {
    console.error(`Missing ${SCRIPT}`);
    process.exit(1);
}

if (!uninstall && !existsSync(join(BASE_DIR, "dist", "patcher.js"))) {
    console.error("No build in dist/. Run `pnpm build` first.");
    process.exit(1);
}

const args = [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", SCRIPT,
    "-NoPause"
];

// Dev mode links Discord to this working copy; uninstall does not need it.
if (uninstall) args.push("-Uninstall");
else args.push("-Dev");

const result = spawnSync("powershell.exe", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
