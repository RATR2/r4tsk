export type AnnotationKey = "param" | "return" | "deprecated" | "todo" | "warn" | "important";

export const ANNOTATION_DEFAULTS: Record<AnnotationKey, string> = {
  param: "#1c91ff",
  return: "#731cff",
  deprecated: "#ffd21c",
  todo: "#1c6fff",
  warn: "#ffd21c",
  important: "#ff0000",
};

export interface AnnotationMatch {
  key: AnnotationKey;
  start: number;
  end: number;
}

/**
 * Finds doc/annotation tags within a single line's comment text (the `#`
 * and everything after it). Mirrors the TextMate grammar's tag patterns:
 * `@param`/`@deprecated`/`TODO`/`WARN` color only the tag word, `@return[s]`
 * colors just the tag too, and `!`/`important` colors the rest of the line.
 */
export function scanAnnotations(commentText: string): AnnotationMatch[] {
  const matches: AnnotationMatch[] = [];

  const tagOnly = (re: RegExp, key: AnnotationKey) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(commentText))) {
      matches.push({ key, start: m.index, end: m.index + m[0].length });
    }
  };

  tagOnly(/@param\b/gi, "param");
  tagOnly(/@returns?\b/gi, "return");
  tagOnly(/@deprecated\b/gi, "deprecated");
  tagOnly(/\bTODO\b/g, "todo");
  tagOnly(/\bWARN\b/g, "warn");

  const bangMatch = /!|\bimportant\b/gi.exec(commentText);
  if (bangMatch) {
    matches.push({ key: "important", start: bangMatch.index, end: commentText.length });
  }

  return matches;
}
