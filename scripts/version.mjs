// The version is the tag's. `node scripts/version.mjs v0.2.0` (or with no
// argument, the newest tag on this commit's history) writes it into
// package.json — which tauri.conf.json reads — and Cargo.toml, so the
// bundle, the About box and the MCP server all say the same thing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const arg = process.argv[2] ?? execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
const version = arg.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`not a version: ${arg}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
writeFileSync("src-tauri/Cargo.toml", cargo.replace(/^version = ".*"$/m, `version = "${version}"`));

console.log(version);
