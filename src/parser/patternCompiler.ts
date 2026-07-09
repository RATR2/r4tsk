/**
 * Compiles a real Skript syntax pattern (as found in skript-docs' `docs.json`)
 * into a JavaScript RegExp, so we can tell whether a line of code actually
 * uses a given effect/condition/expression, and which argument text fills
 * which `%placeholder%` - instead of the old approach of just checking
 * whether a keyword happens to appear anywhere on the line.
 *
 * Handles the pattern mini-language:
 *   - `literal text`      -> matched case-insensitively, whitespace-tolerant
 *   - `[optional]`        -> `(?:...)?`
 *   - `(a|b|c)`            -> `(?:a|b|c)`, recursively compiled, nesting allowed
 *   - `%type%`, `%-type%`, `%type1/type2%` -> a captured value slot
 *   - `<regex>`            -> an inline regex fragment (e.g. `loop-<.+>`)
 *   - `N¦alternative`      -> Skript "parse mark" prefix inside a choice group,
 *                             stripped before compiling (not meaningful to us)
 */

export interface PatternPlaceholder {
  /** Accepted types, e.g. ["entities"] or ["entity types", "item types"]. */
  types: string[];
  /** Whether the placeholder was written as `%-type%` (Skript-internal hint; usually still required). */
  literalHint: boolean;
}

export interface CompiledPattern {
  regex: RegExp;
  placeholders: PatternPlaceholder[];
  source: string;
  /**
   * Count of literal (non-wildcard) characters that are *required* to
   * match - i.e. outside any `[optional]` wrapping. Patterns that are
   * mostly optional/wildcard (and so would match almost any input) score
   * low here; used to prefer more specific patterns when several match.
   */
  requiredLiteralChars: number;
}

const PARSE_MARK = /^\d+¦/;

class PatternParser {
  private i = 0;
  private optionalDepth = 0;
  requiredLiteralChars = 0;
  readonly placeholders: PatternPlaceholder[] = [];

  constructor(private readonly text: string) {}

  private peek(): string | undefined {
    return this.text[this.i];
  }

  parseSequence(stopChars: string): string {
    let out = "";
    while (this.i < this.text.length && !stopChars.includes(this.text[this.i])) {
      out += this.parseOne();
    }
    return out;
  }

  private parseOne(): string {
    const c = this.peek();

    if (c === "[") {
      this.i++;
      this.optionalDepth++;
      const inner = this.parseSequence("]");
      this.optionalDepth--;
      this.i++; // consume ]
      return `(?:${inner})?`;
    }

    if (c === "(") {
      this.i++;
      const alternatives: string[] = [];
      let current = "";
      while (this.i < this.text.length && this.text[this.i] !== ")") {
        if (this.text[this.i] === "|" && !this.insideNestedGroup(current)) {
          alternatives.push(current);
          current = "";
          this.i++;
          continue;
        }
        current += this.parseOne();
      }
      alternatives.push(current);
      this.i++; // consume )
      const cleaned = alternatives.map((alt) => alt.replace(PARSE_MARK, ""));
      return `(?:${cleaned.join("|")})`;
    }

    if (c === "%") {
      this.i++;
      let typeText = "";
      while (this.i < this.text.length && this.text[this.i] !== "%") {
        typeText += this.text[this.i];
        this.i++;
      }
      this.i++; // consume closing %
      const literalHint = typeText.startsWith("-");
      const cleanTypeText = literalHint ? typeText.slice(1) : typeText;
      this.placeholders.push({ types: cleanTypeText.split("/").map((t) => t.trim()), literalHint });
      // Greedy, not lazy: with a literal anchor later in the pattern (e.g.
      // "%entities% (to|%direction%) %location%"), greedy backtracking
      // (start maximal, shrink until the rest matches) reliably converges
      // on the anchor. Lazy captures have no such pull and tend to settle
      // on the minimal/wrong split when a wildcard alternative is nearby.
      return "(.+)";
    }

    if (c === "<") {
      this.i++;
      let regexSource = "";
      while (this.i < this.text.length && this.text[this.i] !== ">") {
        regexSource += this.text[this.i];
        this.i++;
      }
      this.i++; // consume >
      return `(?:${regexSource})`;
    }

    if (c === "¦") {
      // stray parse-mark separator outside a choice group - skip it
      this.i++;
      return "";
    }

    // Plain literal character. Collapse runs of whitespace into `\s*`
    // (not `\s+`): pattern whitespace often sits directly next to an
    // `[optional]`/`(choice)` group, and when that group is absent there
    // may be no literal space left in the actual text to match against.
    if (/\s/.test(c ?? "")) {
      while (this.i < this.text.length && /\s/.test(this.text[this.i])) this.i++;
      return "\\s*";
    }

    this.i++;
    if (this.optionalDepth === 0) this.requiredLiteralChars++;
    return escapeRegExp(c ?? "");
  }

  /** Heuristic: are we still inside an unclosed nested `(` within `current`? Used so `|` only splits at this group's own top level. */
  private insideNestedGroup(current: string): boolean {
    let depth = 0;
    for (const ch of current) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    return depth > 0;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compilePattern(pattern: string): CompiledPattern {
  const parser = new PatternParser(pattern.trim());
  const body = parser.parseSequence("");

  return {
    regex: new RegExp(`^\\s*${body}\\s*$`, "i"),
    placeholders: parser.placeholders,
    source: pattern,
    requiredLiteralChars: parser.requiredLiteralChars,
  };
}
