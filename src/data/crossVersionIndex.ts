import { DocsDatabase } from "./docsDatabase";
import { DocsDownloadManager } from "./docsDownloadManager";
import { DocEntry } from "./docsTypes";
import { isNewerVersion, listArchivedVersions, pickCheckpointVersions, versionDistance } from "./docsVersions";

export interface CrossVersionMatch {
  entry: DocEntry;
  version: string;
}

/**
 * A small set of "checkpoint" docs databases (one per supported major.minor
 * line) used to answer "this isn't in my version's docs - does it exist in
 * a different one?" without downloading every historical archive.
 */
export class CrossVersionIndex {
  private readonly databases = new Map<string, DocsDatabase>();
  private warmedUp = false;
  private warmUpPromise: Promise<void> | undefined;

  constructor(private readonly downloadManager: DocsDownloadManager) {}

  /** Downloads (or loads from cache) one checkpoint database per supported minor line. Safe to call more than once. */
  warmUp(): Promise<void> {
    if (this.warmedUp) return Promise.resolve();
    if (this.warmUpPromise) return this.warmUpPromise;

    this.warmUpPromise = (async () => {
      try {
        const available = await listArchivedVersions();
        const checkpoints = pickCheckpointVersions(available);
        for (const version of checkpoints) {
          if (this.databases.has(version)) continue;
          try {
            const result = await this.downloadManager.getDatabaseForVersion(version);
            if (result) this.databases.set(result.resolvedVersion, result.db);
          } catch {
            // skip this checkpoint, keep going with the rest
          }
        }
        this.warmedUp = true;
      } finally {
        this.warmUpPromise = undefined;
      }
    })();

    return this.warmUpPromise;
  }

  get isReady(): boolean {
    return this.warmedUp;
  }

  /** Finds the closest (by version distance) checkpoint that has a match for `word`, other than `excludeVersion`. */
  findElsewhere(word: string, excludeVersion?: string): CrossVersionMatch | undefined {
    const candidates: CrossVersionMatch[] = [];
    for (const [version, db] of this.databases) {
      if (version === excludeVersion) continue;
      const entry = db.lookupWord(word);
      if (entry) candidates.push({ entry, version });
    }
    if (candidates.length === 0) return undefined;

    if (excludeVersion) {
      candidates.sort((a, b) => versionDistance(a.version, excludeVersion) - versionDistance(b.version, excludeVersion));
    }
    return candidates[0];
  }

  /**
   * Whether some checkpoint *newer* than `currentVersion` has a
   * non-deprecated entry with this exact name - i.e. the feature was
   * reorganized (e.g. a condition folded into a newer "property" system)
   * rather than actually going away. Only newer versions count: every
   * deprecated feature was trivially non-deprecated at some *earlier*
   * point, so checking older versions would match almost anything.
   */
  hasNonDeprecatedElsewhere(name: string, currentVersion: string): boolean {
    for (const [version, db] of this.databases) {
      if (!isNewerVersion(version, currentVersion)) continue;
      if (db.hasNonDeprecatedEntryNamed(name)) return true;
    }
    return false;
  }
}
