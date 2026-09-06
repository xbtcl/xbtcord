// eslint's import-alias autofix built the paths with path.join, so on Windows they came
// out with backslashes, which is not a module specifier anything can resolve.
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.argv[2] ?? "src";
let fixed = 0;

function walk(dir) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(name)) continue;

        const text = readFileSync(full, "utf-8");
        // Only touch backslashes inside a module specifier that starts with an alias.
        const next = text.replace(/(["'])(@[\w/]+)((?:\\[\w.-]+)+)(["'])/g,
            (_, q1, head, tail, q2) => q1 + head + tail.replace(/\\/g, "/") + q2);

        if (next !== text) {
            writeFileSync(full, next);
            fixed++;
            console.log("fixed " + full);
        }
    }
}

walk(ROOT);
console.log(fixed + " files repaired");
