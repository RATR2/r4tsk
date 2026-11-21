/**
 * Conservative "Skript may not understand this line" detection. Pure text in,
 * line numbers out (no `vscode` dependency) so it can be tested standalone.
 *
 * Design goal: a LOW false-positive rate - when in doubt, don't flag. The docs
 * database can't resolve typed expressions, addon-defined syntax we haven't
 * loaded, or custom structures, so we only look at lines whose context we
 * understand and skip anything we can't judge.
 */
import { DocCategory } from "../data/docsTypes";
import { DocsDatabase } from "../data/docsDatabase";
import { findCommentStart, maskLine } from "../utils/textScanning";

export interface UnrecognizedLine {
  line: number;
  /** Column range of the code (comment stripped, indentation excluded). */
  start: number;
  end: number;
}

/** Top-level headers whose body is plain statements. */
const STATEMENT_HEADER = /^(on|every|at|after|before|function|local\s+function)\b/i;
/** Control-flow words handled by the docs engine's own prefix stripping, plus a few other keywords the engine does not know. */
const FLOW_ONLY = /^(else|else\s+if|try|catch|finally|loop|while|if|unless)\b/i;
/** A call like `foo(...)` at the start of the code, possibly `local`/namespaced. */
const FUNCTION_CALL_START = /^[a-zA-Z_][a-zA-Z0-9_]*\(/;

/** A whole statement line is an effect, a condition or a section; expression patterns (some are `<.+>` regex catch-alls) would match nearly anything. */
const STATEMENT_CATEGORIES: DocCategory[] = ["effect", "condition", "section"];

const verdictCaches = new WeakMap<DocsDatabase, Map<string, boolean>>();

function indentOf(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

/** True if the (comment-free, trimmed) statement should be left alone because we can't judge it. */
function cannotJudge(code: string): boolean {
  const masked = maskLine(code);
  // Code-level `%` expressions ("%player%" outside a string): needs types.
  if (masked.includes("%")) return true;
  if (FUNCTION_CALL_START.test(code)) return true;
  // Only variables / literals / punctuation: nothing to look up.
  const letters = masked.replace(/\{[^}]*\}/g, " ").replace(/[^a-zA-Z]+/g, " ").trim();
  if (letters === "") return true;
  // Unbalanced brackets/quotes: user is probably mid-edit; skip.
  if ((code.match(/"/g)?.length ?? 0) % 2 === 1) return true;
  return false;
}

/** Whether `code` (a statement, trailing colon already removed) matches any known syntax. */
function recognized(db: DocsDatabase, code: string): boolean {
  let cache = verdictCaches.get(db);
  if (!cache) {
    cache = new Map();
    verdictCaches.set(db, cache);
  }
  const hit = cache.get(code);
  if (hit !== undefined) return hit;
  const verdict = checkRecognized(db, code);
  if (cache.size > 20000) cache.clear();
  cache.set(code, verdict);
  return verdict;
}

function checkRecognized(db: DocsDatabase, code: string): boolean {
  if (db.matchLine(code, STATEMENT_CATEGORIES, undefined, true)) return true;
  // Compound conditions: "a is b and c is d" / "x or y" - judge each side.
  const parts = splitTopLevel(code, /\s+(?:and|or)\s+/i);
  if (parts.length > 1) return parts.every((p) => !p.trim() || db.matchLine(p, STATEMENT_CATEGORIES, undefined, true) !== undefined);
  return false;
}

function splitTopLevel(code: string, sep: RegExp): string[] {
  const masked = maskLine(code).replace(/[{(\[][^})\]]*[})\]]/g, (m) => " ".repeat(m.length));
  const parts: string[] = [];
  let last = 0;
  const re = new RegExp(sep.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    parts.push(code.slice(last, m.index));
    last = m.index + m[0].length;
  }
  parts.push(code.slice(last));
  return parts;
}

export function findUnrecognizedLines(
  lines: string[],
  db: DocsDatabase | undefined,
  stats?: { judged: number }
): UnrecognizedLine[] {
  if (!db) return [];
  const results: UnrecognizedLine[] = [];

  // Stack of open blocks: indent of the header, whether its body is
  // trustworthy statements, and whether it is a `command` root (whose direct
  // children are settings, not statements, except `trigger:`).
  const stack: { indent: number; statements: boolean; commandRoot?: boolean }[] = [];

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const cs = findCommentStart(raw);
    const code = (cs === -1 ? raw : raw.slice(0, cs)).trim();
    if (!code) continue;
    const indent = indentOf(raw);

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentOk = stack.length > 0 && stack.every((b) => b.statements);
    const isHeader = code.endsWith(":");

    if (indent === 0) {
      // Top-level structure header. Anything we don't know (options, using,
      // import, variables, addon structures...) has an untrusted body.
      stack.length = 0;
      const isFunction = /^(local\s+)?function\b/i.test(code);
      if (isHeader || isFunction) {
        if (/^command\b/i.test(code)) stack.push({ indent: 0, statements: true, commandRoot: true });
        else stack.push({ indent: 0, statements: STATEMENT_HEADER.test(code) });
      }
      continue;
    }

    if (isHeader) {
      const body = code.replace(/:\s*$/, "").trim();
      const parent = stack[stack.length - 1];
      if (parent?.commandRoot) {
        // Only `trigger:` directly under a command is statements.
        stack.push({ indent, statements: /^trigger$/i.test(body) });
        continue;
      }
      let ok = false;
      if (parentOk) ok = FLOW_ONLY.test(body) || (!cannotJudge(body) && recognized(db, body));
      stack.push({ indent, statements: ok });
      continue;
    }

    if (!parentOk) continue;
    if (stack[stack.length - 1].commandRoot) continue;
    if (cannotJudge(code)) continue;
    if (stats) stats.judged++;
    if (recognized(db, code)) continue;

    const startCol = raw.length - raw.trimStart().length;
    results.push({ line: ln, start: startCol, end: startCol + code.length });
  }
  return results;
}
