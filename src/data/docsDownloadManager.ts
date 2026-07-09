import * as fs from "fs";
import * as path from "path";
import { DocsDatabase } from "./docsDatabase";
import { downloadDocsText, listArchivedVersions, resolveVersionFolder } from "./docsVersions";

export interface ResolvedDocs {
  db: DocsDatabase;
  resolvedVersion: string;
}

/** Downloads and caches skript-docs `docs.json` archives per Skript version. */
export class DocsDownloadManager {
  constructor(private readonly cacheDir: string) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  private cachePath(folder: string): string {
    return path.join(this.cacheDir, `${encodeURIComponent(folder)}.json`);
  }

  private readCacheText(folder: string): string | undefined {
    try {
      return fs.readFileSync(this.cachePath(folder), "utf8");
    } catch {
      return undefined;
    }
  }

  private async fetchAndCacheText(folder: string): Promise<string | undefined> {
    const cached = this.readCacheText(folder);
    if (cached) return cached;

    const text = await downloadDocsText(folder);
    if (!DocsDatabase.fromText(text)) return undefined; // invalid/unsupported schema - don't cache it
    fs.writeFileSync(this.cachePath(folder), text, "utf8");
    return text;
  }

  /**
   * Resolves `userVersion` to the closest available archive and returns a
   * loaded, cached database for it, merged with any `additionalTexts`
   * (e.g. addon docs.json contents) the caller wants included. Retries
   * against the closest schema-supported version if the first pick turns
   * out to be an unsupported legacy-format archive.
   */
  async getDatabaseForVersion(userVersion: string, additionalTexts: string[] = []): Promise<ResolvedDocs | undefined> {
    const available = await listArchivedVersions();

    const firstPick = resolveVersionFolder(userVersion, available, false);
    if (firstPick) {
      try {
        const text = await this.fetchAndCacheText(firstPick);
        if (text) {
          const db = DocsDatabase.fromMultipleTexts([text, ...additionalTexts]);
          if (db) return { db, resolvedVersion: firstPick };
        }
      } catch {
        // fall through to the legacy-excluding retry below
      }
    }

    const fallbackPick = resolveVersionFolder(userVersion, available, true);
    if (fallbackPick && fallbackPick !== firstPick) {
      try {
        const text = await this.fetchAndCacheText(fallbackPick);
        if (text) {
          const db = DocsDatabase.fromMultipleTexts([text, ...additionalTexts]);
          if (db) return { db, resolvedVersion: fallbackPick };
        }
      } catch {
        // give up, caller falls back to the bundled snapshot
      }
    }

    return undefined;
  }
}
