import * as fs from "fs";
import * as path from "path";
import { SkriptHubClient } from "./skriptHubClient";
import { ConversionReport, convertSkriptHubSyntax } from "./skriptHubAdapter";
import { AddonFunction } from "./addonFunctions";

export interface AddonBuildResult {
  functions: AddonFunction[];
  report: ConversionReport;
  /** True when the generated docs file now differs from what was there before. */
  changed: boolean;
  /** Set when only an out-of-date cache could be used (offline). */
  stale: boolean;
}

/**
 * Turns the user's selected addon names into a generated docs file in
 * global storage, which the extension merges like any other additional
 * docs.json. Deliberately file-based, so the existing loading paths
 * (`DocsDatabase.loadMultiple`, the downloaded-docs path) need no changes.
 */
export class AddonDocsManager {
  constructor(
    private readonly storageDir: string,
    readonly client: SkriptHubClient
  ) {}

  get docsPath(): string {
    return path.join(this.storageDir, "skripthub-addons-docs.json");
  }

  /** The generated file's path if it exists. */
  existingDocsPath(): string | undefined {
    return fs.existsSync(this.docsPath) ? this.docsPath : undefined;
  }

  /** Regenerates the docs file for `selected`; with none selected the file is removed. Throws if offline with no cache. */
  async build(selected: string[]): Promise<AddonBuildResult> {
    let previous: string | undefined;
    try {
      previous = fs.readFileSync(this.docsPath, "utf8");
    } catch {
      previous = undefined;
    }

    if (selected.length === 0) {
      if (previous !== undefined) fs.rmSync(this.docsPath, { force: true });
      return { functions: [], report: { considered: 0, converted: 0, droppedPatterns: 0, duplicates: 0, removed: 0, skipped: [] }, changed: previous !== undefined, stale: false };
    }

    const syntax = await this.client.getSyntax();
    const { docs, functions, report } = convertSkriptHubSyntax(syntax.entries, selected);
    const text = JSON.stringify(docs);
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.docsPath, text, "utf8");
    return { functions, report, changed: text !== previous, stale: syntax.stale };
  }
}
