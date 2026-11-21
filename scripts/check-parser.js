// Bundles scripts/parserChecks.ts with esbuild (the checks need no `vscode` module) and runs it.
const esbuild = require("esbuild");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const outfile = path.join(os.tmpdir(), `r4tsk-parser-checks-${process.pid}.js`);
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "parserChecks.ts")],
  bundle: true,
  platform: "node",
  outfile,
  logLevel: "warning",
});
const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
try {
  require("fs").unlinkSync(outfile);
} catch {}
process.exit(result.status ?? 1);
