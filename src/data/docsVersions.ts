import * as https from "https";

const ARCHIVES_API = "https://api.github.com/repos/SkriptLang/skript-docs/contents/docs/archives";
const RAW_BASE = "https://raw.githubusercontent.com/SkriptLang/skript-docs/main/docs";

/** Versions confirmed (by inspection) to use the unsupported legacy docs.json schema. */
export const KNOWN_LEGACY_VERSIONS = new Set([
  "2.6.4", "2.7.0", "2.7.1", "2.8.0", "2.8.1", "2.8.2", "2.8.3", "2.8.4",
  "2.9.0-pre2", "2.9.0", "2.9.1", "2.9.2", "2.9.3", "2.9.4", "2.9.5", "2.10.2",
]);

/** Fallback list in case the GitHub API is unreachable (offline, rate-limited). */
const FALLBACK_VERSIONS = [
  "2.6.4", "2.7.0", "2.7.1", "2.8.0", "2.8.1", "2.8.2", "2.8.3", "2.8.4",
  "2.9.0-pre2", "2.9.0", "2.9.1", "2.9.2", "2.9.3", "2.9.4", "2.9.5",
  "2.10.0-beta1-pre", "2.10.0-pre1", "2.10.0", "2.10.1", "2.10.2",
  "2.11.0-pre1", "2.11.0-pre2", "2.11.0", "2.11.1", "2.11.2",
  "2.12.0-pre1", "2.12.0-pre2", "2.12.0", "2.12.1", "2.12.2",
  "2.13.0-pre1", "2.13.0", "2.13.2",
  "2.14.0-pre1", "2.14.0-pre2", "2.14.0", "2.14.1", "2.14.2", "2.14.3",
  "2.15.0-pre1", "2.15.0-pre2", "2.15.0", "2.15.1", "2.15.2", "2.15.3", "2.15.4",
  "2.16.0-pre1",
];

function httpGet(url: string, redirectsLeft = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "r4tsk-vscode-extension" }, timeout: 15000 }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        res.resume();
        httpGet(res.headers.location, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

export async function listArchivedVersions(): Promise<string[]> {
  try {
    const text = await httpGet(ARCHIVES_API);
    const json = JSON.parse(text) as { name: string; type: string }[];
    const names = json.filter((i) => i.type === "dir").map((i) => i.name);
    return names.length > 0 ? names : FALLBACK_VERSIONS;
  } catch {
    return FALLBACK_VERSIONS;
  }
}

export function archiveDocsUrl(version: string): string {
  return `${RAW_BASE}/archives/${encodeURIComponent(version)}/docs.json`;
}

export async function downloadDocsText(version: string): Promise<string> {
  return httpGet(archiveDocsUrl(version));
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  isPre: boolean;
  raw: string;
}

function parseVersion(v: string): ParsedVersion {
  const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  return {
    major: m ? Number(m[1]) : 0,
    minor: m ? Number(m[2]) : 0,
    patch: m?.[3] ? Number(m[3]) : 0,
    isPre: /-/.test(v),
    raw: v,
  };
}

function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** Whether `version` is strictly newer than `other` (major.minor.patch only, ignores pre-release tags). */
export function isNewerVersion(version: string, other: string): boolean {
  return compareVersions(parseVersion(version), parseVersion(other)) > 0;
}

/**
 * Resolves a user-typed version string (e.g. "2.9", "2.15.2") to the best
 * matching archive folder name: exact match first, then same major.minor
 * (preferring the highest non-prerelease patch), then the nearest available
 * version overall. If `excludeLegacy` is set, versions known to use the
 * unsupported legacy schema are skipped when an alternative exists.
 */
export function resolveVersionFolder(
  userVersion: string,
  available: string[],
  excludeLegacy = false
): string | undefined {
  const trimmed = userVersion.trim().replace(/^v/i, "");
  const pool = excludeLegacy ? available.filter((v) => !KNOWN_LEGACY_VERSIONS.has(v)) : available;
  if (pool.length === 0) return undefined;

  if (pool.includes(trimmed)) return trimmed;

  const parsedUser = parseVersion(trimmed);
  const userHasPatch = /^\d+\.\d+\.\d+/.test(trimmed);

  const sameLine = pool
    .map(parseVersion)
    .filter(
      (v) => v.major === parsedUser.major && v.minor === parsedUser.minor && (!userHasPatch || v.patch === parsedUser.patch)
    );

  if (sameLine.length > 0) {
    sameLine.sort((a, b) => (a.isPre !== b.isPre ? (a.isPre ? 1 : -1) : compareVersions(b, a)));
    return sameLine[0].raw;
  }

  const all = pool.map(parseVersion).sort((a, b) => compareVersions(b, a));
  const lowerOrEqual = all.filter((v) => compareVersions(v, parsedUser) <= 0);
  return (lowerOrEqual[0] ?? all[all.length - 1])?.raw;
}

/** Rough "how far apart" two versions are, dominated by major/minor differences. */
export function versionDistance(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  return Math.abs(pa.major - pb.major) * 1000 + Math.abs(pa.minor - pb.minor) * 10 + Math.abs(pa.patch - pb.patch);
}


/**
 * Picks one representative version per supported (non-legacy) major.minor
 * line - the highest non-prerelease patch if one exists, else the highest
 * prerelease - for building a small cross-version reference index.
 */
export function pickCheckpointVersions(available: string[]): string[] {
  const supported = available.filter((v) => !KNOWN_LEGACY_VERSIONS.has(v));
  const byLine = new Map<string, ParsedVersion[]>();

  for (const v of supported) {
    const parsed = parseVersion(v);
    const key = `${parsed.major}.${parsed.minor}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key)!.push(parsed);
  }

  const checkpoints: string[] = [];
  for (const versions of byLine.values()) {
    versions.sort((a, b) => (a.isPre !== b.isPre ? (a.isPre ? 1 : -1) : compareVersions(b, a)));
    checkpoints.push(versions[0].raw);
  }

  return checkpoints.sort((a, b) => compareVersions(parseVersion(a), parseVersion(b)));
}
