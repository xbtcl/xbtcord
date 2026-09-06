// @ts-check

/**
 * Fails the build if two plugins share a name.
 *
 * This is not something the compiler can catch. The plugin registry is an object keyed by
 * name, so a duplicate silently replaces the earlier entry - while both modules still get
 * imported and both still register their webpack patches. The result is two sets of
 * patches fighting over the same Discord internals, and a client that dies on startup with
 * nothing useful in the log.
 *
 * Importing another fork's plugin directory is exactly how that happens: Equicord and this
 * fork both ship a `UserAreaAPI` and a `HeaderBarAPI`. Cheaper to check than to debug.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = process.argv[2] ?? ".";

// Must stay in step with the pluginDirs list in scripts/build/common.mjs.
const DIRS = ["plugins/_api", "plugins/_core", "plugins", "equicordplugins", "xbtplugins", "userplugins"];

// The same matcher the build uses, so a clash here is a clash at runtime.
const MATCHER = /definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/;

const seen = new Map();
let total = 0;

for (const dir of DIRS) {
    const full = join(ROOT, "src", dir);
    if (!existsSync(full)) continue;

    for (const entry of readdirSync(full)) {
        if (entry.startsWith("_") || entry.startsWith(".") || entry === "index.ts") continue;

        const path = join(full, entry);
        let source = null;

        if (statSync(path).isDirectory()) {
            for (const file of ["index.ts", "index.tsx"]) {
                const candidate = join(path, file);
                if (existsSync(candidate)) {
                    source = readFileSync(candidate, "utf-8");
                    break;
                }
            }
        } else {
            source = readFileSync(path, "utf-8");
        }

        if (!source) continue;

        const name = MATCHER.exec(source)?.[3];
        if (!name) continue;

        total++;
        if (!seen.has(name)) seen.set(name, []);
        seen.get(name).push(`${dir}/${entry}`);
    }
}

const clashes = [...seen].filter(([, where]) => where.length > 1);

console.log(`${total} plugins, ${seen.size} distinct names`);

if (!clashes.length) {
    console.log("no name collisions");
} else {
    console.error(`\n${clashes.length} plugin name collision(s) - the client will not start:`);
    for (const [name, where] of clashes) {
        console.error(`  ${name}\n    ${where.join("\n    ")}`);
    }
    process.exitCode = 1;
}
