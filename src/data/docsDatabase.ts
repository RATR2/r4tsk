import * as fs from "fs";
import { DocCategory, DocEntry, DocsRef, RawDocsFile, RawPatternedEntry, UnknownDocsFile } from "./docsTypes";
import { adaptToRawDocsFile } from "./docsSchemaAdapter";
import { CompiledPattern, compilePattern } from "../parser/patternCompiler";
import { findCommentStart } from "../utils/textScanning";

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
 * Events anchor by a slug of their *name* on the site, not their raw `id` -
 * unlike other categories, many distinct events share one generic backing
 * class (e.g. over a hundred use "SimpleEvent"), so the id can't double as
 * a per-entry anchor there. Confirmed against the real site: "On Explode"
 * -> "#explode", "On Firework Explode" -> "#firework_explode".
 */
function eventSlug(name: string): string {
  return name
    .replace(/^on\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
  const anchor = entry.category === "event" ? eventSlug(entry.name) : entry.id;
  return `https://docs.skriptlang.org/${page}#${anchor}`;
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
    uid: "", // assigned by DocsDatabase's constructor, once merged across all sources - raw.id isn't unique (see DocEntry.id)
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

const MAX_WORD_EXPANSIONS = 32;

/**
 * Expands a whitespace-free pattern segment (letters plus possibly nested
 * `(choice)`/`[optional]` groups, no spaces) into every literal string it
 * could produce - e.g. `explo(d(e|ing)|sion)` -> ["explod", "explode",
 * "exploding", "explosion"]. Capped to avoid combinatorial blowup on
 * heavily-branching segments.
 */
function expandSegment(segment: string): string[] {
  let results = [""];
  let i = 0;

  while (i < segment.length) {
    if (results.length >= MAX_WORD_EXPANSIONS) break;
    const c = segment[i];

    if (c === "(" || c === "[") {
      const close = c === "(" ? ")" : "]";
      let depth = 1;
      let j = i + 1;
      while (j < segment.length && depth > 0) {
        if (segment[j] === c) depth++;
        else if (segment[j] === close) depth--;
        j++;
      }
      const inner = segment.slice(i + 1, j - 1);
      const alternatives = c === "(" ? splitTopLevelPipe(inner).flatMap(expandSegment) : ["", ...expandSegment(inner)];
      results = results.flatMap((r) => alternatives.map((a) => r + a)).slice(0, MAX_WORD_EXPANSIONS);
      i = j;
      continue;
    }

    results = results.map((r) => r + c);
    i++;
  }

  return [...new Set(results.map((r) => r.toLowerCase()))];
}

/**
 * A `%placeholder%` at the very start/end of an unanchored match is greedy
 * and has nothing to anchor against on that side, so it happily swallows
 * whatever unrelated text precedes/follows the pattern's actual literal
 * content within the line (e.g. matching `broadcast "%player's display
 * name%"` would otherwise report the whole `broadcast "%player's display
 * name` span instead of just `player's display name`). Trims a leading
 * and/or trailing capture group back to where the literal content actually
 * starts/ends, using exact capture positions from the "d" (hasIndices) flag.
 * Falls back to the untrimmed range if that would invert start/end (e.g. a
 * pattern that's nothing but a single placeholder, no literal anchor at all).
 */
function tightenMatchRange(match: RegExpExecArray): [number, number] {
  const fullStart = match.index;
  const fullEnd = match.index + match[0].length;
  const indices = (match as RegExpExecArray & { indices?: Array<[number, number] | undefined> }).indices;
  if (!indices || indices.length <= 1) return [fullStart, fullEnd];

  let start = fullStart;
  let end = fullEnd;
  const first = indices[1];
  if (first && first[0] === start) start = first[1];
  const last = indices[indices.length - 1];
  if (last && last[1] === end) end = last[0];

  return start < end ? [start, end] : [fullStart, fullEnd];
}

function splitTopLevelPipe(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(" || text[i] === "[") depth++;
    else if (text[i] === ")" || text[i] === "]") depth--;
    else if (text[i] === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Finds compound words built by directly-adjacent choice/optional groups
 * with no whitespace between the letters and the group - e.g. the
 * `explode`/`exploding`/`explosion` event pattern `explo(d(e|ing)|sion)`,
 * where plain bracket-stripping would only ever see meaningless fragments
 * ("explo", "d", "e", "ing", "sion"), never the actual words used in code.
 */
function extractCompoundWordForms(pattern: string): string[] {
  const cleaned = pattern.replace(/<[^>]*>/g, " ").replace(/%[^%]*%/g, " ");
  const segments = cleaned.split(/\s+/).filter(Boolean);
  const words = new Set<string>();

  for (const segment of segments) {
    if (!/[()[\]]/.test(segment)) continue;
    for (const variant of expandSegment(segment)) {
      for (const w of variant.match(/[a-z']+/g) ?? []) {
        if (w.length > 1) words.add(w);
      }
    }
  }

  return [...words];
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
  private readonly byUid = new Map<string, DocEntry>();
  private readonly byNameLower = new Map<string, DocEntry[]>();
  private readonly byKeyword = new Map<string, DocEntry[]>();
  private readonly compiledPatternCache = new Map<string, CompiledPattern[]>();
  private readonly substringPatternCache = new Map<string, CompiledPattern[]>();

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

    // `raw.id` is the *underlying implementation class*, not a unique syntax
    // identifier - e.g. over a hundred distinct Skript events all share the
    // id "SimpleEvent". Assign our own globally-unique key up front so nothing
    // downstream (candidate resolution, pattern caching) silently collides.
    this.entries.forEach((entry, i) => {
      entry.uid = `${entry.category}:${i}`;
    });

    for (const entry of this.entries) {
      this.byUid.set(entry.uid, entry);

      const nameKey = entry.name.toLowerCase();
      if (!this.byNameLower.has(nameKey)) this.byNameLower.set(nameKey, []);
      this.byNameLower.get(nameKey)!.push(entry);

      const keywords = new Set<string>();
      for (const p of entry.patterns) {
        for (const k of extractKeywords(p)) keywords.add(k);
        for (const k of extractAttachedOptionalForms(p)) keywords.add(k);
        for (const k of extractCompoundWordForms(p)) keywords.add(k);
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

    // The primary source must parse on its own - fromMultipleTexts skips
    // whatever fails and keeps going with the rest, so if the primary is
    // invalid/unsupported but an addon happens to parse fine, it would
    // otherwise return an addon-only database. Callers treat a non-undefined
    // result as "the custom core docs file loaded", so that would silently
    // drop all of vanilla Skript's syntax instead of falling back to the
    // bundled core docs like it's supposed to.
    if (!DocsDatabase.fromMultipleTexts([primaryText])) return undefined;

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
    let compiled = this.compiledPatternCache.get(entry.uid);
    if (!compiled) {
      compiled = entry.patterns.map((p) => {
        try {
          return compilePattern(p);
        } catch {
          return undefined;
        }
      }).filter((c): c is CompiledPattern => c !== undefined);
      this.compiledPatternCache.set(entry.uid, compiled);
    }
    return compiled;
  }

  private getSubstringCompiledPatterns(entry: DocEntry): CompiledPattern[] {
    let compiled = this.substringPatternCache.get(entry.uid);
    if (!compiled) {
      compiled = entry.patterns.map((p) => {
        try {
          return compilePattern(p, false);
        } catch {
          return undefined;
        }
      }).filter((c): c is CompiledPattern => c !== undefined);
      this.substringPatternCache.set(entry.uid, compiled);
    }
    return compiled;
  }

  /**
   * Finds every deprecated syntax element actually *used* (as a real match
   * of its pattern, not just a coincidentally-shared keyword) anywhere
   * within `line` - including as a sub-expression of something else, e.g.
   * `%player%'s display name` embedded inside a `broadcast` effect.
   *
   * This is deliberately substring-based rather than reusing `matchLine`
   * (whole-line only): a bare word like "display" is a poor signal on its
   * own (it's also a literal entity type - "item display" - and unrelated
   * property names - "display scale"), but the *pattern* actually requires
   * "display" immediately followed by "name[s]", which those don't have.
   */
  findDeprecatedUsages(line: string): Array<{ entry: DocEntry; index: number; length: number }> {
    const results: Array<{ entry: DocEntry; index: number; length: number }> = [];
    const candidateUids = new Set<string>();

    CODE_WORD.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = CODE_WORD.exec(line))) {
      const word = wordMatch[0].toLowerCase();
      if (STOPWORDS.has(word)) continue;
      for (const entry of this.byKeyword.get(word) ?? []) if (entry.deprecated) candidateUids.add(entry.uid);
      for (const entry of this.byNameLower.get(word) ?? []) if (entry.deprecated) candidateUids.add(entry.uid);
    }

    for (const uid of candidateUids) {
      const entry = this.byUid.get(uid);
      if (!entry) continue;
      for (const pattern of this.getSubstringCompiledPatterns(entry)) {
        const match = pattern.regex.exec(line);
        if (match) {
          const [index, end] = tightenMatchRange(match);
          results.push({ entry, index, length: end - index });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Tries to match a full line of *code* (not a pattern) against real
   * Skript syntax patterns, telling us exactly which effect/condition/
   * expression governs the line and what text fills each `%placeholder%` -
   * unlike `lookupWord`, which only checks whether a keyword appears
   * anywhere on the line. Candidates are narrowed via the keyword index
   * first so we're not compiling/testing all ~1200 patterns per line.
   */
  matchLine(line: string, categoryFilter?: DocCategory[]): LineMatch | undefined {
    const commentStart = findCommentStart(line);
    const code = commentStart === -1 ? line : line.slice(0, commentStart);

    let trimmed = code.trim();
    // Control-flow keywords ("if", "else if", "while", "unless") and a
    // trailing section colon aren't part of the condition/effect's own
    // pattern - they're Skript's own block-structure syntax wrapping it.
    trimmed = trimmed.replace(/^(else\s+if|if|while|unless)\s+/i, "");
    trimmed = trimmed.replace(/:\s*$/, "");
    if (!trimmed) return undefined;

    const candidateUids = new Set<string>();
    CODE_WORD.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = CODE_WORD.exec(trimmed))) {
      const word = wordMatch[0].toLowerCase();
      if (STOPWORDS.has(word)) continue;
      for (const entry of this.byKeyword.get(word) ?? []) candidateUids.add(entry.uid);
      for (const entry of this.byNameLower.get(word) ?? []) candidateUids.add(entry.uid);
    }

    let best: LineMatch | undefined;
    let bestSpecificity = -1;

    for (const uid of candidateUids) {
      const entry = this.byUid.get(uid);
      if (!entry) continue;
      if (categoryFilter && !categoryFilter.includes(entry.category)) continue;

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
