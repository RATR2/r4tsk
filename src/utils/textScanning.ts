/**
 * Replaces the contents of string literals and line comments with spaces,
 * preserving line length so character offsets still line up with the
 * original text. Skript uses `""` as an escaped quote inside a string.
 */
export function maskLine(line: string): string {
  const out = line.split("");
  let inString = false;

  for (let i = 0; i < out.length; i++) {
    const c = out[i];

    if (inString) {
      if (c === '"') {
        if (out[i + 1] === '"') {
          out[i] = " ";
          out[i + 1] = " ";
          i++;
          continue;
        }
        inString = false;
        continue;
      }
      out[i] = " ";
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "#") {
      for (let j = i; j < out.length; j++) out[j] = " ";
      break;
    }
  }

  return out.join("");
}

/**
 * Blanks out the contents of `{variable}` references (keeping the braces),
 * so a variable name like `{_floor}` doesn't get mistaken for the `floor`
 * keyword when scanning code for real Skript syntax usage.
 */
export function maskVariableBraces(line: string): string {
  const out = line.split("");
  let depth = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === "{") {
      depth++;
      continue;
    }
    if (out[i] === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) out[i] = " ";
  }
  return out.join("");
}

/** Returns the index of the `#` that starts a line comment, or -1 if there is none. */
export function findCommentStart(line: string): number {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inString) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "#") return i;
  }
  return -1;
}

export interface StringContentRange {
  /** Offset of the first character of the string's content (after the opening quote). */
  start: number;
  /** Offset just past the last character of the string's content (before the closing quote). */
  end: number;
}

/**
 * Finds the content spans of double-quoted string literals on a line
 * (excluding the surrounding quotes), respecting Skript's `""` escape.
 * Comments are ignored (a `#` outside a string ends scanning).
 */
export function findStringContentRanges(line: string): StringContentRange[] {
  const ranges: StringContentRange[] = [];
  let inString = false;
  let contentStart = -1;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (inString) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          i++;
          continue;
        }
        ranges.push({ start: contentStart, end: i });
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      contentStart = i + 1;
      continue;
    }

    if (c === "#") break;
  }

  return ranges;
}

export interface TopLevelToken {
  text: string;
  start: number;
  end: number;
}

/**
 * Splits `text` on top-level commas, respecting nesting of (), [], {}, %%
 * and quoted strings so that arguments like `{object}` or `func(a, b)`
 * are not split apart.
 */
export function splitTopLevel(text: string, delimiter = ","): TopLevelToken[] {
  const tokens: TopLevelToken[] = [];
  let depth = 0;
  let inString = false;
  let inPercent = false;
  let tokenStart = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "%") {
      inPercent = !inPercent;
      continue;
    }

    if (inPercent) continue;

    if (c === "(" || c === "[" || c === "{") {
      depth++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      continue;
    }

    if (depth === 0 && text.startsWith(delimiter, i)) {
      tokens.push(sliceTrimmed(text, tokenStart, i));
      tokenStart = i + delimiter.length;
    }
  }

  if (tokenStart <= text.length) {
    tokens.push(sliceTrimmed(text, tokenStart, text.length));
  }

  return tokens.filter((t) => t.text.length > 0 || tokens.length === 1);
}

function sliceTrimmed(text: string, start: number, end: number): TopLevelToken {
  const raw = text.slice(start, end);
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return {
    text: raw.trim(),
    start: start + leading,
    end: end - trailing,
  };
}

/**
 * Given the index of an opening bracket, finds the index of its matching
 * closing bracket, respecting nesting and string literals.
 */
export function findMatchingClose(text: string, openIndex: number): number {
  const open = text[openIndex];
  const close = open === "(" ? ")" : open === "[" ? "]" : open === "{" ? "}" : undefined;
  if (!close) return -1;

  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
