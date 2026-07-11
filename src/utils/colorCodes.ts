/**
 * Parses Minecraft/Bukkit chat formatting codes within a piece of string
 * content and produces styled "runs" - matching real chat rendering rules:
 * a color code (legacy `&0`-`&f`, or a `<#rrggbb>` hex tag) resets any active
 * formatting, format codes (`&l`/`&m`/`&n`/`&o`) stack, and `&r` resets both.
 */

export interface ColorRun {
  start: number;
  end: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

const LEGACY_COLORS: Record<string, string> = {
  "0": "#000000",
  "1": "#0000AA",
  "2": "#00AA00",
  "3": "#00AAAA",
  "4": "#AA0000",
  "5": "#AA00AA",
  "6": "#FFAA00",
  "7": "#AAAAAA",
  "8": "#555555",
  "9": "#5555FF",
  a: "#55FF55",
  b: "#55FFFF",
  c: "#FF5555",
  d: "#FF55FF",
  e: "#FFFF55",
  f: "#FFFFFF",
};

const TAG_PATTERN = /&([0-9a-fklmnor])|<#{1,2}([0-9a-fA-F]{6})>/gi;

export function scanColorRuns(text: string): ColorRun[] {
  const runs: ColorRun[] = [];
  let color: string | undefined;
  let bold = false;
  let italic = false;
  let underline = false;
  let strikethrough = false;
  let runStart = 0;

  const flush = (end: number) => {
    if (end > runStart && (color || bold || italic || underline || strikethrough)) {
      runs.push({ start: runStart, end, color, bold, italic, underline, strikethrough });
    }
  };

  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(text))) {
    flush(match.index);

    const legacy = match[1]?.toLowerCase();
    const hex = match[2];

    if (hex) {
      color = `#${hex.toLowerCase()}`;
      bold = italic = underline = strikethrough = false;
    } else if (legacy === "r") {
      color = undefined;
      bold = italic = underline = strikethrough = false;
    } else if (legacy && LEGACY_COLORS[legacy]) {
      color = LEGACY_COLORS[legacy];
      bold = italic = underline = strikethrough = false;
    } else if (legacy === "l") bold = true;
    else if (legacy === "m") strikethrough = true;
    else if (legacy === "n") underline = true;
    else if (legacy === "o") italic = true;
    // "k" (obfuscated) has no static color/style equivalent - ignored.

    // The tag itself (e.g. "&c", "<#5f0202>") is a control sequence - in
    // real chat rendering it's never actually shown, only the text after it
    // is. Starting the run after the tag (not at it) keeps that consistent:
    // coloring the tag's own literal characters with an extreme color (very
    // dark or very bright) made the tag syntax itself look broken/illegible,
    // rather than just styling the text it actually affects.
    runStart = match.index + match[0].length;
  }

  flush(text.length);
  return runs;
}
