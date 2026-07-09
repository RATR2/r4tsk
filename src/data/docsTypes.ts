/** Raw shapes as they appear in a skript-docs `docs.json` file (see
 * https://github.com/SkriptLang/skript-docs). Fields vary a bit between
 * categories, so most are optional/loosely typed and normalized on load. */

export interface DocsRef {
  id: string;
  name: string;
}

export interface RawPatternedEntry {
  id: string;
  name: string;
  since?: string | string[];
  deprecated?: boolean;
  description?: string | string[];
  patterns?: string[];
  pattern?: string;
  examples?: string[];
  events?: DocsRef[] | null;
  returns?: DocsRef;
  /** Older (pre-2.13) docs.json files call this `returnType` instead of `returns`. */
  returnType?: DocsRef;
  properties?: DocsRef[];
}

/** Loosest possible shape for a freshly-parsed docs.json, before schema detection. */
export type UnknownDocsFile = Record<string, unknown>;

export interface RawDocsFile {
  version: { major: number; minor: number };
  source: { name: string; version: string };
  conditions: RawPatternedEntry[];
  effects: RawPatternedEntry[];
  expressions: RawPatternedEntry[];
  events: RawPatternedEntry[];
  structures: RawPatternedEntry[];
  sections: RawPatternedEntry[];
  types: RawPatternedEntry[];
  functions: RawPatternedEntry[];
  properties: RawPatternedEntry[];
  experiments: RawPatternedEntry[];
}

export type DocCategory =
  | "condition"
  | "effect"
  | "expression"
  | "event"
  | "structure"
  | "section"
  | "type"
  | "function"
  | "property"
  | "experiment";

/** A single syntax element, normalized to one shape regardless of category. */
export interface DocEntry {
  /** Raw id from docs.json - the underlying Skript implementation class, e.g. "EffTeleport". NOT guaranteed unique: many trivial events share one generic backing class (e.g. over a hundred distinct events all use "SimpleEvent"), so this can't be used as a lookup key on its own. */
  id: string;
  /** Assigned by DocsDatabase at load time (`${category}:${index}`) - always unique, safe to use as a map/cache key. */
  uid: string;
  name: string;
  category: DocCategory;
  since?: string;
  deprecated: boolean;
  description: string;
  patterns: string[];
  examples: string[];
  returns?: DocsRef;
}
