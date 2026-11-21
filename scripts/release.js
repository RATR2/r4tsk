#!/usr/bin/env node
/**
 * Builds r4tsk and publishes it to the VS Code Marketplace and Open VSX.
 *
 *   npm run release            typecheck, package, confirm, publish to both
 *   npm run release:dry        typecheck and package only, publishes nothing
 *
 * Flags: --dry-run  --yes (skip the confirmation)  --only vsce|ovsx  --allow-dirty
 * Tokens come from the environment or a git-ignored .env file, and are never printed or written anywhere:
 *   VSCE_PAT   VS Code Marketplace personal access token (publisher "r4tsk")
 *   OVSX_PAT   Open VSX access token (namespace "r4tsk" must already exist)
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");

/**
 * Loads KEY=VALUE lines from .env into process.env without overriding
 * variables that are already set. Values are never printed.
 */
function loadEnvFile() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  if (process.platform !== "win32" && (fs.statSync(file).mode & 0o077) !== 0) {
    console.warn("release: .env is readable by other users, run: chmod 600 .env");
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] === undefined) continue;
    let value = match[2];
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
loadEnvFile();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex === -1 ? undefined : args[onlyIndex + 1];
if (onlyIndex !== -1 && only !== "vsce" && only !== "ovsx") {
  console.error('\nrelease: --only needs a value, "vsce" or "ovsx"');
  process.exit(1);
}

const dryRun = flag("dry-run");
const targets = [
  { id: "vsce", label: "VS Code Marketplace", tokenVar: "VSCE_PAT" },
  { id: "ovsx", label: "Open VSX", tokenVar: "OVSX_PAT" },
].filter((t) => !only || t.id === only);

function fail(message) {
  console.error(`\nrelease: ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { capture = false } = {}) {
  // On Windows npm and npx are .cmd shims, which Node can't launch without a shell.
  const shell = process.platform === "win32" && (cmd === "npm" || cmd === "npx");
  const result = spawnSync(cmd, cmdArgs, { cwd: root, shell, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8" });
  if (result.error) fail(`could not run ${cmd}: ${result.error.message}`);
  return result;
}

function step(title) {
  console.log(`\n== ${title}`);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    })
  );
}

async function main() {
  const version = pkg.version;
  const vsix = `${pkg.name}-${version}.vsix`;

  step(`Checking ${pkg.publisher}.${pkg.name}@${version}`);
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }).stdout.trim();
  const commit = run("git", ["rev-parse", "--short", "HEAD"], { capture: true }).stdout.trim();
  const dirty = run("git", ["status", "--porcelain"], { capture: true }).stdout.trim();
  console.log(`branch ${branch} at ${commit}`);
  if (dirty && !flag("allow-dirty")) fail("working tree has uncommitted changes (commit them, or pass --allow-dirty)");

  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (lock.version !== version) fail(`package-lock.json says ${lock.version} but package.json says ${version}`);

  if (!dryRun) {
    const missing = targets.filter((t) => !process.env[t.tokenVar]).map((t) => t.tokenVar);
    if (missing.length) fail(`missing environment variable(s): ${missing.join(", ")}`);
  }

  step("Typecheck");
  if (run("npm", ["run", "typecheck"]).status !== 0) fail("typecheck failed");

  step(`Packaging ${vsix}`);
  if (run("npx", ["vsce", "package", "--out", vsix]).status !== 0) fail("packaging failed");
  if (!fs.existsSync(path.join(root, vsix))) fail(`expected ${vsix} was not produced`);

  if (dryRun) {
    console.log(`\nDry run done. Built ${vsix}; nothing was published.`);
    return;
  }

  const names = targets.map((t) => t.label).join(" and ");
  if (!flag("yes") && !(await confirm(`\nPublish ${pkg.name}@${version} to ${names}?`))) fail("cancelled, nothing was published");

  const results = [];
  for (const target of targets) {
    step(`Publishing to ${target.label}`);
    const cmd =
      target.id === "vsce"
        ? ["vsce", "publish", "--packagePath", vsix]
        : ["ovsx", "publish", vsix];
    const status = run("npx", cmd).status;
    results.push({ label: target.label, ok: status === 0 });
  }

  console.log("\n== Result");
  for (const r of results) console.log(`${r.ok ? "published" : "FAILED   "}  ${r.label}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main();
