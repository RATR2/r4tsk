import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import * as zlib from "zlib";
import { SkriptHubSyntax } from "./skriptHubAdapter";

const API_BASE = "https://skripthub.net/api/v1";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = "skripthub-syntax.json";

export interface SkriptHubAddon {
  name: string;
  url?: string;
  author?: string;
}

export interface SyntaxResult {
  entries: SkriptHubSyntax[];
  fetchedAt: number;
  /** True when the network failed and an older cache (past its one-day lifetime) was used instead. */
  stale: boolean;
}

function httpGetJson<T>(url: string, redirectsLeft = 3): Promise<T> {
  return new Promise((resolve, reject) => {
    // Read-only GET; nothing about the user or their project is sent.
    const req = https.get(
      url,
      { headers: { "User-Agent": "r4tsk-vscode-extension", "Accept-Encoding": "gzip", Accept: "application/json" }, timeout: 60000 },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          httpGetJson<T>(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        const stream = res.headers["content-encoding"] === "gzip" ? res.pipe(zlib.createGunzip()) : res;
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch (err) {
            reject(err);
          }
        });
        stream.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** Trims a raw API entry to the fields r4tsk uses; the full list is ~8 MB. */
function slim(raw: Record<string, unknown>): SkriptHubSyntax | undefined {
  const addon = raw.addon as { name?: unknown; usage_score?: unknown } | null | undefined;
  if (typeof raw.title !== "string" || typeof raw.syntax_pattern !== "string" || typeof raw.syntax_type !== "string") return undefined;
  if (!addon || typeof addon.name !== "string") return undefined;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    title: raw.title,
    description: str(raw.description),
    syntax_pattern: raw.syntax_pattern,
    syntax_type: raw.syntax_type,
    return_type: str(raw.return_type),
    event_values: str(raw.event_values),
    event_cancellable: raw.event_cancellable === true,
    compatible_addon_version: str(raw.compatible_addon_version),
    json_id: str(raw.json_id),
    entries: str(raw.entries),
    mark_as_removed: raw.mark_as_removed === true,
    addon: { name: addon.name, usage_score: typeof addon.usage_score === "number" ? addon.usage_score : undefined },
  };
}

/**
 * Reads the public SkriptHub API. The syntax list is large, so it is cached
 * on disk (slimmed, with a timestamp) and reused for a day; when the network
 * is unavailable an older cache is used rather than failing.
 */
export class SkriptHubClient {
  private inFlight: Promise<SyntaxResult> | undefined;

  constructor(private readonly cacheDir: string) {}

  private get cachePath(): string {
    return path.join(this.cacheDir, CACHE_FILE);
  }

  private readCache(): { fetchedAt: number; entries: SkriptHubSyntax[] } | undefined {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cachePath, "utf8")) as { fetchedAt?: unknown; entries?: unknown };
      if (typeof parsed.fetchedAt === "number" && Array.isArray(parsed.entries)) {
        return { fetchedAt: parsed.fetchedAt, entries: parsed.entries as SkriptHubSyntax[] };
      }
    } catch {
      // missing or corrupt cache, treat as absent
    }
    return undefined;
  }

  private writeCache(entries: SkriptHubSyntax[], fetchedAt: number): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const tmp = `${this.cachePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ fetchedAt, entries }), "utf8");
      fs.renameSync(tmp, this.cachePath);
    } catch {
      // caching is best-effort
    }
  }

  /** Syntax of all addons. Throws only when offline with no cache at all. */
  getSyntax(forceRefresh = false): Promise<SyntaxResult> {
    this.inFlight ??= this.loadSyntax(forceRefresh).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async loadSyntax(forceRefresh: boolean): Promise<SyntaxResult> {
    const cached = this.readCache();
    if (cached && !forceRefresh && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
      return { entries: cached.entries, fetchedAt: cached.fetchedAt, stale: false };
    }
    try {
      const raw = await httpGetJson<Record<string, unknown>[]>(`${API_BASE}/addonsyntaxlist/`);
      if (!Array.isArray(raw)) throw new Error("unexpected response");
      const entries = raw.map(slim).filter((e): e is SkriptHubSyntax => e !== undefined);
      const fetchedAt = Date.now();
      this.writeCache(entries, fetchedAt);
      return { entries, fetchedAt, stale: false };
    } catch (err) {
      if (cached) return { entries: cached.entries, fetchedAt: cached.fetchedAt, stale: true };
      throw err;
    }
  }

  /** Addon names with author/link; small, so not cached. Empty when offline. */
  async listAddons(): Promise<SkriptHubAddon[]> {
    try {
      const raw = await httpGetJson<Record<string, unknown>[]>(`${API_BASE}/addon/`);
      return (Array.isArray(raw) ? raw : [])
        .filter((a) => typeof a.name === "string")
        .map((a) => ({
          name: a.name as string,
          url: typeof a.url === "string" ? a.url : undefined,
          author: typeof a.author === "string" ? a.author : undefined,
        }));
    } catch {
      return [];
    }
  }
}
