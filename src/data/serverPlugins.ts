import * as fs from "fs";
import * as path from "path";

/** Walks up from `start` to the server's plugins folder (the one that contains Skript), or undefined. */
export function findPluginsDir(start: string): string | undefined {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 12; depth++) {
    if (path.basename(dir) === "plugins" && isDir(path.join(dir, "Skript"))) return dir;
    const inner = path.join(dir, "plugins");
    if (isDir(path.join(inner, "Skript"))) return inner;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function listJars(pluginsDir: string): string[] {
  try {
    return fs.readdirSync(pluginsDir).filter((f) => f.toLowerCase().endsWith(".jar"));
  } catch {
    return [];
  }
}

/** The docs.json that Skript's `/sk gen-docs` writes, if it was copied down next to the scripts. */
export function generatedDocsPath(pluginsDir: string): string | undefined {
  const file = path.join(pluginsDir, "Skript", "docs", "docs.json");
  try {
    return fs.statSync(file).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "SkBee-3.26.0.jar" -> "skbee", "skript-gui-1.4.0.jar" -> "skriptgui". */
export function jarStem(file: string): string {
  const base = file.replace(/\.jar$/i, "");
  return normalize(base.replace(/[-_ ]v?\d[\w.+-]*$/, ""));
}

/** SkriptHub addon names whose jar is in the plugins folder. Skript itself never counts. */
export function matchAddons(jarFiles: string[], addonNames: string[]): string[] {
  const stems = new Set(jarFiles.map(jarStem));
  stems.delete("skript");
  return addonNames.filter((name) => normalize(name) !== "skript" && stems.has(normalize(name)));
}
