import { RawDocsFile, RawPatternedEntry } from "./docsTypes";
import { AddonFunction, cleanSignature } from "./addonFunctions";
import { compilePattern } from "../parser/patternCompiler";

/** The subset of a SkriptHub `addonsyntaxlist` entry r4tsk uses (the cache stores only these, to keep it small). */
export interface SkriptHubSyntax {
  title: string;
  description?: string | null;
  syntax_pattern: string;
  syntax_type: string;
  return_type?: string | null;
  event_values?: string | null;
  event_cancellable?: boolean | null;
  compatible_addon_version?: string | null;
  json_id?: string | null;
  entries?: string | null;
  mark_as_removed?: boolean | null;
  addon: { name: string; usage_score?: number };
}

export interface SkippedEntry {
  addon: string;
  title: string;
  type: string;
  reason: string;
}

export interface ConversionReport {
  /** Entries of the selected addons that were looked at (excluding removed ones). */
  considered: number;
  /** Entries that ended up in the docs with at least one usable pattern. */
  converted: number;
  /** Individual patterns dropped from otherwise converted entries. */
  droppedPatterns: number;
  /** Entries identical to an earlier one (same addon, type, title and patterns) - merged. */
  duplicates: number;
  /** Entries SkriptHub marks as removed - ignored. */
  removed: number;
  skipped: SkippedEntry[];
}

export interface ConversionResult {
  docs: RawDocsFile;
  functions: AddonFunction[];
  report: ConversionReport;
}

const CATEGORY_KEY: Record<string, keyof Pick<RawDocsFile, "expressions" | "effects" | "events" | "conditions" | "types" | "sections" | "functions" | "structures">> = {
  expression: "expressions",
  effect: "effects",
  event: "events",
  condition: "conditions",
  type: "types",
  section: "sections",
  function: "functions",
  structure: "structures",
};

/** Id prefix of every converted entry, so other code can tell SkriptHub-derived docs from core ones. */
export const SKRIPTHUB_ID_PREFIX = "skripthub:";

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function splitTopLevelPipes(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** `%*string%`, `%~object%`, `%-number@1%` -> `%string%`, `%object%`, `%-number%`. */
function normalizePlaceholder(inner: string): string {
  const hint = inner.startsWith("-");
  const body = inner.replace(/^[-*~^]+/, "").replace(/@-?\d+$/, "").trim();
  return body ? (hint ? "-" : "") + body : "";
}

/**
 * Converts one SkriptHub pattern to the notation core docs use. Handles the
 * differences found in the SkriptHub data: escaped brackets (`\[`, turned
 * into an inline `<\[>` regex), `%*type%`/`%~type%`/`%type@1%` placeholder
 * modifiers, and parse marks (`1¦`, left for the pattern compiler, which
 * ignores them). Returns an error string for patterns that cannot be
 * expressed (unbalanced brackets/percent signs, unclosed `<`, invalid regex).
 */
export function convertPattern(pattern: string): { pattern: string } | { error: string } {
  let out = "";
  const stack: string[] = [];
  const s = pattern.trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && "[]()|%".includes(s[i + 1])) {
      out += s[i + 1] === "%" ? "<%>" : `<\\${s[i + 1]}>`;
      i++;
    } else if (c === "%") {
      const end = s.indexOf("%", i + 1);
      if (end === -1) return { error: "unclosed % placeholder" };
      const norm = normalizePlaceholder(s.slice(i + 1, end));
      if (!norm) return { error: "empty % placeholder" };
      out += `%${norm}%`;
      i = end;
    } else if (c === "<") {
      const end = s.indexOf(">", i + 1);
      if (end === -1) return { error: "unclosed < regex" };
      const body = s.slice(i + 1, end);
      try {
        new RegExp(body);
      } catch {
        return { error: "invalid inline regex" };
      }
      out += s.slice(i, end + 1);
      i = end;
    } else {
      if (c === "(" || c === "[") stack.push(c);
      else if (c === ")" || c === "]") {
        const open = stack.pop();
        if ((c === ")" && open !== "(") || (c === "]" && open !== "[")) return { error: "unbalanced brackets" };
      }
      out += c;
    }
  }
  if (stack.length > 0) return { error: "unbalanced brackets" };
  if (out.replace(/<[^>]*>|%[^%]*%/g, "").trim() === "") return { error: "no literal text" };
  try {
    compilePattern(out);
    compilePattern(out, false);
  } catch {
    return { error: "pattern does not compile" };
  }
  return { pattern: out };
}

function entriesNote(entries: string | null | undefined): string {
  if (!entries) return "";
  try {
    const list = JSON.parse(entries) as { name?: string; isRequired?: boolean }[];
    if (!Array.isArray(list) || list.length === 0) return "";
    const names = list.filter((e) => e && e.name).map((e) => `\`${e.name}\`${e.isRequired ? " (required)" : ""}`);
    return names.length ? `\n\nEntries: ${names.join(", ")}` : "";
  } catch {
    return "";
  }
}

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n?/g, "\n").trim();
}

interface FunctionParts {
  name: string;
  signature: string;
  returns: string;
}

function parseFunctionPattern(pattern: string, returnType: string): FunctionParts | undefined {
  const signature = cleanSignature(splitLines(pattern)[0] ?? "");
  const m = /^([A-Za-z_]\w*)\s*\(.*\)\s*(?:::\s*(.+))?$/s.exec(signature);
  if (!m) return undefined;
  return { name: m[1], signature, returns: returnType || (m[2] ?? "").trim() };
}

/**
 * Converts SkriptHub syntax entries of the chosen addons into core-docs
 * schema (`docs.json`-shaped), ready to merge as an additional docs source,
 * plus the addon function signatures for argument-count checks.
 */
export function convertSkriptHubSyntax(syntax: SkriptHubSyntax[], addonNames: string[]): ConversionResult {
  const wanted = new Set(addonNames.map((n) => n.toLowerCase()));
  const docs: RawDocsFile = {
    version: { major: 1, minor: 0 },
    source: { name: "SkriptHub addons", version: "skripthub" },
    conditions: [],
    effects: [],
    expressions: [],
    events: [],
    structures: [],
    sections: [],
    types: [],
    functions: [],
    properties: [],
    experiments: [],
  };
  const functions: AddonFunction[] = [];
  const report: ConversionReport = { considered: 0, converted: 0, droppedPatterns: 0, duplicates: 0, removed: 0, skipped: [] };
  const seen = new Set<string>();

  for (const e of syntax) {
    const addon = e.addon?.name ?? "";
    if (!wanted.has(addon.toLowerCase()) || addon.toLowerCase() === "skript") continue;
    if (e.mark_as_removed) {
      report.removed++;
      continue;
    }
    report.considered++;
    const skip = (reason: string) => report.skipped.push({ addon, title: e.title, type: e.syntax_type, reason });

    const key = CATEGORY_KEY[e.syntax_type];
    if (!key) {
      skip(`unknown syntax type '${e.syntax_type}'`);
      continue;
    }
    if (!e.syntax_pattern || !e.syntax_pattern.trim()) {
      skip("no pattern");
      continue;
    }

    const description =
      `*${addon} addon*` +
      (cleanText(e.description) ? `\n\n${cleanText(e.description)}` : "") +
      (e.event_values ? `\n\nEvent values: ${cleanText(e.event_values)}` : "") +
      (e.event_cancellable ? "\n\nCancellable." : "") +
      entriesNote(e.entries);
    const since = cleanText(e.compatible_addon_version) ? `${addon} ${cleanText(e.compatible_addon_version)}` : undefined;
    const returnType = cleanText(e.return_type);

    let raw: RawPatternedEntry;
    if (e.syntax_type === "function") {
      const fn = parseFunctionPattern(e.syntax_pattern, returnType);
      if (!fn) {
        skip("unrecognized function signature");
        continue;
      }
      const dedupe = `function:${addon}:${fn.signature}`;
      if (seen.has(dedupe)) {
        report.duplicates++;
        continue;
      }
      seen.add(dedupe);
      raw = {
        id: `${SKRIPTHUB_ID_PREFIX}${addon}:${fn.name}`,
        name: fn.name,
        since,
        description,
        patterns: [fn.signature],
        returns: fn.returns ? { id: fn.returns, name: fn.returns } : undefined,
      };
      functions.push({
        name: fn.name,
        signature: fn.signature,
        returns: fn.returns,
        addons: [addon],
        description: cleanText(e.description) || undefined,
      });
    } else {
      let candidates = splitLines(e.syntax_pattern);
      if (e.syntax_type === "type") candidates = candidates.flatMap(splitTopLevelPipes);
      const patterns: string[] = [];
      const errors: string[] = [];
      for (const c of candidates) {
        const r = convertPattern(c);
        if ("pattern" in r) {
          if (!patterns.includes(r.pattern)) patterns.push(r.pattern);
        } else {
          errors.push(r.error);
        }
      }
      if (patterns.length === 0) {
        skip(errors[0] ?? "no usable pattern");
        continue;
      }
      const dedupe = `${e.syntax_type}:${addon}:${e.title}:${patterns.join("\n")}`;
      if (seen.has(dedupe)) {
        report.duplicates++;
        continue;
      }
      seen.add(dedupe);
      report.droppedPatterns += errors.length;
      raw = {
        id: `${SKRIPTHUB_ID_PREFIX}${addon}:${e.json_id || e.title}`,
        name: e.title,
        since,
        description,
        patterns,
        returns: returnType ? { id: returnType, name: returnType } : undefined,
      };
    }
    docs[key].push(raw);
    report.converted++;
  }

  return { docs, functions, report };
}
