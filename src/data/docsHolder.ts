import { DocsDatabase } from "./docsDatabase";

/**
 * Mutable holder for the "active" docs database, since it can be swapped
 * out at runtime (e.g. after downloading a database matching the user's
 * configured Skript version) without re-registering the providers that
 * depend on it.
 */
export class DocsHolder {
  private _current: DocsDatabase | undefined;
  private _activeVersionLabel: string | undefined;

  constructor(initial: DocsDatabase | undefined, activeVersionLabel?: string) {
    this._current = initial;
    this._activeVersionLabel = activeVersionLabel;
  }

  get current(): DocsDatabase | undefined {
    return this._current;
  }

  /** The resolved archive version label the current database corresponds to (may differ from what the user typed, e.g. after a legacy-version fallback). */
  get activeVersionLabel(): string | undefined {
    return this._activeVersionLabel;
  }

  set(db: DocsDatabase, versionLabel: string): void {
    this._current = db;
    this._activeVersionLabel = versionLabel;
  }
}
