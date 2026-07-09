import * as fs from "fs";
import { DocCategory, DocEntry, DocsRef, RawDocsFile, RawPatternedEntry, UnknownDocsFile } from "./docsTypes";
import { adaptToRawDocsFile } from "./docsSchemaAdapter";
import { CompiledPattern, compilePattern } from "../parser/patternCompiler";

export interface LineMatch {
  entry: DocEntry;
  pattern: CompiledPattern;
  /** Trimmed captured text per `%placeholder%`, in pattern order; undefined where an unmatched choice-alternative left the group empty. */
  values: (string | undefined)[];
}

const CODE_WORD = /[a-zA-Z][a-zA-Z'-]*/g;

/** Per-category page on docs.skriptlang.org - confirmed by checking that each page anchors entries by their exact `id` (e.g. `effects.html#EffTeleport`, `classes.html#boolean`). Properties/experiments have no dedicated page, so they're omitted. */
const DOCS_SITE_PAGE: Partial<Record<DocCategory, string>> = {
  condition: "conditions.html",
  effect: "effects.html",
  expression: "expressions.html",
  event: "events.html",
  structure: "structures.html",
  section: "sections.html",
  type: "classes.html",
  function: "functions.html",
};

/**
 * A link to the entry's page on the official docs site, if that category
 * has one. Note this always points at whatever Skript version the live
 * site currently documents - not necessarily the version `docs.json` this
 * entry came from - so it's a "see the full picture" link, not a guarantee
 * of an exact version match.
 */
export function docsSiteUrl(entry: DocEntry): string | undefined {
  const page = DOCS_SITE_PAGE[entry.category];
  if (!page) return undefined;
  return `https://docs.skriptlang.org/${page}#${entry.id}`;
}

function safeReadFile(path: string): string | undefined {
  try {
    return fs.readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function joinText(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value.join("\n") : value;
}

function joinSince(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizeCategory(raw: RawPatternedEntry, category: DocCategory): DocEntry {
  const patterns = raw.patterns ?? (raw.pattern ? [raw.pattern] : []);
  return {
    id: raw.id,
    name: raw.name,
    category,
    since: joinSince(raw.since),
    deprecated: raw.deprecated === true,
    description: joinText(raw.description),
    patterns,
    examples: raw.examples ?? [],
    returns: raw.returns,
  };
}

export function normalizeDocsFile(raw: RawDocsFile): DocEntry[] {
  const entries: DocEntry[] = [];
  const push = (list: RawPatternedEntry[] | undefined, category: DocCategory) => {
    for (const item of list ?? []) entries.push(normalizeCategory(item, category));
  };
  push(raw.conditions, "condition");
  push(raw.effects, "effect");
  push(raw.expressions, "expression");
  push(raw.events, "event");
  push(raw.structures, "structure");
  push(raw.sections, "section");
  push(raw.types, "type");
  push(raw.functions, "function");
  push(raw.properties, "property");
  push(raw.experiments, "experiment");
  return entries;
}

/**
 * Reduces a Skript syntax pattern to a plain, human-readable phrase:
 * drops regex captures (`<...>`), turns `%type%` placeholders into
 * `<type>`, and picks the first alternative out of `(a|b|c)`/`[optional]`
 * groups. Not a full pattern parser - just enough to display and to
 * pull out literal keywords for lookup.
 */
export function simplifyPattern(pattern: string, category?: DocCategory): string {
  // Function patterns are already plain call syntax, e.g. `floor(n: number)`
  // - their parens aren't Skript's `(a|b)` alternation syntax.
  if (category === "function") return pattern.trim();

  let s = pattern.replace(/<[^>]*>/g, " ");
  s = s.replace(/%([^%]*)%/g, (_, inner: string) => `<${inner.replace(/^-/, "")}>`);

  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(/\(([^()]*)\)/g, (_, inner: string) => inner.split("|")[0]);
    s = s.replace(/\[([^[\]]*)\]/g, (_, inner: string) => inner);
    if (s === before) break;
  }

  return s.replace(/\s+/g, " ").trim();
}

/** Extracts every literal word that appears in a pattern, across all its alternatives. */
export function extractKeywords(pattern: string): string[] {
  let s = pattern.replace(/<[^>]*>/g, " ");
  s = s.replace(/%[^%]*%/g, " ");
  s = s.replace(/[[\]()|¦]/g, " ");
  const words = s.toLowerCase().match(/[a-z']+/g) ?? [];
  return [...new Set(words)].filter((w) => w.length > 1);
}

/**
 * Skript patterns commonly write an optional suffix directly attached to a
 * word, e.g. `contain[s]`, `remove[d]` - which the plain bracket-stripping
 * in `extractKeywords` splits into two unrelated tokens ("contain", "s"),
 * losing the fact that "contains" (the concatenated surface form) is also
 * a valid literal reading. Returns those concatenated forms so they can be
 * added to the keyword index too.
 */
function extractAttachedOptionalForms(pattern: string): string[] {
  const forms: string[] = [];
  const re = /([a-zA-Z']+)\[([a-zA-Z']*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern))) {
    forms.push((m[1] + m[2]).toLowerCase());
  }
  return forms;
}

/** Common words that would otherwise match almost every entry and drown out real lookups. */
const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "is", "are", "was", "were", "with", "for",
  "from", "this", "that", "these", "those", "and", "or", "not", "it", "at", "by", "as",
  "be", "do", "does", "if", "its", "into", "your", "you", "will", "can", "all", "any",
]);

/**
 * Skript's `loop-<anything>` is a single pseudo-identifier (loop-value,
 * loop-index, loop-key, loop-block, ...) matched by one generic expression
 * whose pattern uses a regex capture (`loop-<.+>`) - it can't be found via
 * the normal keyword index, and naively looking up just "value"/"index"/etc
 * (e.g. if a caller doesn't hyphen-tokenize) would wrongly match an
 * unrelated entry. Resolved directly by name instead.
 */
const HYPHENATED_PSEUDO_PREFIXES: { prefix: RegExp; name: string }[] = [{ prefix: /^loop-/i, name: "loop value" }];

const CATEGORY_PRIORITY: DocCategory[] = [
  "type",
  "event",
  "effect",
  "condition",
  "function",
  "expression",
  "structure",
  "section",
  "property",
  "experiment",
];

export class DocsDatabase {
  readonly sourceVersion: string;
  private readonly entries: DocEntry[];
  private readonly byId = new Map<string, DocEntry>();
  private readonly byNameLower = new Map<string, DocEntry[]>();
  private readonly byKeyword = new Map<string, DocEntry[]>();
  private readonly compiledPatternCache = new Map<string, CompiledPattern[]>();

  /**
   * Accepts one or more raw sources - normally the core Skript docs plus
   * any addon docs.json files (e.g. from SkBee, Skript-GUI, etc., each
   * generated via Skript's own `/sk gen-docs` on a server with that addon
   * installed - same schema, since the generator captures every installed
   * addon's syntax, not just vanilla Skript's). All entries are merged into
   * one combined index, so lookup/pattern-matching spans every source.
   * `sourceVersion` reflects only the *first* (core) source, since that's
   * what drives version-comparison - addons don't have their own notion of
   * "Skript version".
   */
  constructor(raw: RawDocsFile | RawDocsFile[]) {
    const sources = Array.isArray(raw) ? raw : [raw];
    this.sourceVersion = sources[0]?.source?.version ?? "unknown";
    this.entries = sources.flatMap((source) => normalizeDocsFile(source));

    for (const entry of this.entries) {
      this.byId.set(entry.id, entry);

      const nameKey = entry.name.toLowerCase();
      if (!this.byNameLower.has(nameKey)) this.byNameLower.set(nameKey, []);
      this.byNameLower.get(nameKey)!.push(entry);

      const keywords = new Set<string>();
      for (const p of entry.patterns) {
        for (const k of extractKeywords(p)) keywords.add(k);
        for (const k of extractAttachedOptionalForms(p)) keywords.add(k);
      }
      for (const keyword of keywords) {
        if (STOPWORDS.has(keyword)) continue;
        if (!this.byKeyword.has(keyword)) this.byKeyword.set(keyword, []);
        this.byKeyword.get(keyword)!.push(entry);
      }
    }
  }

  static load(defaultPath: string, customPath?: string): DocsDatabase | undefined {
    for (const path of [customPath, defaultPath]) {
      if (!path) continue;
      try {
        const text = fs.readFileSync(path, "utf8");
        const db = DocsDatabase.fromText(text);
        if (db) return db;
      } catch {
        // try the next candidate path
      }
    }
    return undefined;
  }

  /**
   * Loads a primary (core Skript) docs.json plus any number of additional
   * files (addon docs.json) to merge in, given as absolute file paths. A
   * source that fails to read/parse is skipped rather than failing the
   * whole load - the primary source must succeed, additional ones are
   * best-effort.
   */
  static loadMultiple(primaryPath: string, additionalPaths: string[] = []): DocsDatabase | undefined {
    const primaryText = safeReadFile(primaryPath);
    if (!primaryText) return undefined;

    const texts = [primaryText, ...additionalPaths.map(safeReadFile).filter((t): t is string => t !== undefined)];
    return DocsDatabase.fromMultipleTexts(texts);
  }

  /** Parses+normalizes a docs.json's raw text. Returns undefined for invalid JSON or an unsupported (legacy) schema. */
  static fromText(text: string): DocsDatabase | undefined {
    return DocsDatabase.fromMultipleTexts([text]);
  }

  /** Like `fromText`, but merges several sources; a source that fails to parse is skipped rather than failing the whole load. */
  static fromMultipleTexts(texts: string[]): DocsDatabase | undefined {
    const raws: RawDocsFile[] = [];
    for (const text of texts) {
      try {
        const parsed = JSON.parse(text) as UnknownDocsFile;
        const raw = adaptToRawDocsFile(parsed);
        if (raw) raws.push(raw);
      } catch {
        // skip this source, keep going with the rest
      }
    }
    if (raws.length === 0) return undefined;
    return new DocsDatabase(raws);
  }

  getById(id: string): DocEntry | undefined {
    return this.byId.get(id);
  }

  /** Whether some entry with this exact name (any category) exists and isn't deprecated. */
  hasNonDeprecatedEntryNamed(name: string): boolean {
    const matches = this.byNameLower.get(name.toLowerCase());
    return !!matches?.some((m) => !m.deprecated);
  }

  /** Best-effort single-word docs lookup: exact name/id match first, then keyword index. */
  lookupWord(word: string): DocEntry | undefined {
    for (const { prefix, name } of HYPHENATED_PSEUDO_PREFIXES) {
      if (prefix.test(word)) {
        const match = this.byNameLower.get(name);
        if (match && match.length > 0) return match[0];
      }
    }

    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) return undefined;

    const exactName = this.byNameLower.get(lower);
    if (exactName && exactName.length > 0) return this.pickBest(exactName, lower);

    const byId = this.byId.get(word);
    if (byId) return byId;

    const byKeyword = this.byKeyword.get(lower);
    if (byKeyword && byKeyword.length > 0) return this.pickBest(byKeyword, lower);

    return undefined;
  }

  private pickBest(candidates: DocEntry[], word: string): DocEntry {
    const startsWithWord = candidates.find((c) =>
      c.patterns.some((p) => extractKeywords(p)[0] === word)
    );
    if (startsWithWord) return startsWithWord;

    for (const category of CATEGORY_PRIORITY) {
      const match = candidates.find((c) => c.category === category);
      if (match) return match;
    }
    return candidates[0];
  }

  getReturnTypeRef(entry: DocEntry): DocsRef | undefined {
    return entry.returns;
  }

  /** A human-readable rendering of the pattern most relevant to `word` (or the first one). */
  displayPattern(entry: DocEntry, word?: string): string | undefined {
    if (entry.patterns.length === 0) return undefined;
    const lower = word?.toLowerCase();
    const best =
      (lower && entry.patterns.find((p) => extractKeywords(p)[0] === lower)) ??
      (lower && entry.patterns.find((p) => extractKeywords(p).includes(lower))) ??
      entry.patterns[0];
    return simplifyPattern(best, entry.category);
  }

  private getCompiledPatterns(entry: DocEntry): CompiledPattern[] {
    let compiled = this.compiledPatternCache.get(entry.id);
    if (!compiled) {
      compiled = entry.patterns.map((p) => {
        try {
          return compilePattern(p);
        } catch {
          return undefined;
        }
      }).filter((c): c is CompiledPattern => c !== undefined);
      this.compiledPatternCache.set(entry.id, compiled);
    }
    return compiled;
  }

  /**
   * Tries to match a full line of *code* (not a pattern) against real
   * Skript syntax patterns, telling us exactly which effect/condition/
   * expression governs the line and what text fills each `%placeholder%` -
   * unlike `lookupWord`, which only checks whether a keyword appears
   * anywhere on the line. Candidates are narrowed via the keyword index
   * first so we're not compiling/testing all ~1200 patterns per line.
   */
  matchLine(line: string): LineMatch | undefined {
    let trimmed = line.trim();
    // Control-flow keywords ("if", "else if", "while", "unless") and a
    // trailing section colon aren't part of the condition/effect's own
    // pattern - they're Skript's own block-structure syntax wrapping it.
    trimmed = trimmed.replace(/^(else\s+if|if|while|unless)\s+/i, "");
    trimmed = trimmed.replace(/:\s*$/, "");
    if (!trimmed) return undefined;

    const candidateIds = new Set<string>();
    CODE_WORD.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = CODE_WORD.exec(trimmed))) {
      const word = wordMatch[0].toLowerCase();
      if (STOPWORDS.has(word)) continue;
      for (const entry of this.byKeyword.get(word) ?? []) candidateIds.add(entry.id);
      for (const entry of this.byNameLower.get(word) ?? []) candidateIds.add(entry.id);
    }

    let best: LineMatch | undefined;
    let bestSpecificity = -1;

    for (const id of candidateIds) {
      const entry = this.byId.get(id);
      if (!entry) continue;

      for (const pattern of this.getCompiledPatterns(entry)) {
        const match = pattern.regex.exec(trimmed);
        if (!match) continue;

        const specificity = pattern.requiredLiteralChars;
        if (specificity <= bestSpecificity) continue;

        bestSpecificity = specificity;
        best = {
          entry,
          pattern,
          values: match.slice(1).map((v) => (v === undefined ? undefined : v.trim())),
        };
      }
    }

    return best;
  }
}
