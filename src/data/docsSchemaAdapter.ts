import { RawDocsFile, RawPatternedEntry, UnknownDocsFile } from "./docsTypes";

/**
 * skript-docs' `docs.json` schema has changed over Skript's history:
 *
 * - **modern** (Skript 2.13.0+): top-level `version: {major, minor}` and
 *   `source: {name, version}`, category arrays including `types` and
 *   `properties`/`experiments`.
 * - **intermediate** (Skript 2.10.0-2.12.x): top-level `skriptVersion`
 *   string, optionally a `version` object but no `source` wrapper, `classes`
 *   instead of `types`, and functions use `returnType` instead of `returns`.
 *   Per-entry field shapes otherwise match modern.
 * - **legacy** (Skript 2.6.4-2.9.5, and oddly 2.10.2): `classes`-first
 *   schema with singular string fields instead of arrays, `"pattern_end"`
 *   sentinel junk in pattern lists, and some files contain literal
 *   unescaped quotes that make them invalid JSON outright. Not supported.
 *
 * This adapter detects which shape a parsed (but not yet normalized) object
 * uses and, for modern/intermediate, returns it in the common `RawDocsFile`
 * shape `docsDatabase.ts` already knows how to normalize. Returns
 * `undefined` for legacy or unrecognized files.
 */
export function adaptToRawDocsFile(raw: UnknownDocsFile): RawDocsFile | undefined {
  if (isModernSchema(raw)) return raw as unknown as RawDocsFile;
  if (isIntermediateSchema(raw)) return adaptIntermediate(raw);
  return undefined;
}

function isModernSchema(raw: UnknownDocsFile): boolean {
  const source = raw.source as { version?: unknown } | undefined;
  return !!source && typeof source.version === "string";
}

function isIntermediateSchema(raw: UnknownDocsFile): boolean {
  if (typeof raw.skriptVersion !== "string" || !Array.isArray(raw.conditions)) return false;
  // The real tell vs. the legacy schema (which also has top-level `conditions`/`classes`
  // keys): legacy entries use singular string `since`/`description`, not arrays.
  const first = (raw.conditions as unknown[])[0] as { since?: unknown } | undefined;
  return !first || Array.isArray(first.since);
}

function adaptIntermediate(raw: UnknownDocsFile): RawDocsFile {
  const asArray = (value: unknown): RawPatternedEntry[] => (Array.isArray(value) ? (value as RawPatternedEntry[]) : []);
  const functions = asArray(raw.functions).map((f) => ({ ...f, returns: f.returns ?? f.returnType }));
  const version = (raw.version as { major: number; minor: number } | undefined) ?? { major: 1, minor: 0 };

  return {
    version,
    source: { name: "Skript", version: raw.skriptVersion as string },
    conditions: asArray(raw.conditions),
    effects: asArray(raw.effects),
    expressions: asArray(raw.expressions),
    events: asArray(raw.events),
    structures: asArray(raw.structures),
    sections: asArray(raw.sections),
    types: asArray(raw.types ?? raw.classes),
    functions,
    properties: asArray(raw.properties),
    experiments: asArray(raw.experiments),
  };
}
