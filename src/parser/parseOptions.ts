import * as vscode from "vscode";
import { findCommentStart } from "../utils/textScanning";
import { OptionInfo, OptionUsage } from "./types";

const OPTIONS_HEADER = /^options\s*:\s*$/;
const OPTION_ENTRY = /^([^\s:][^:]*?)\s*:\s*(.*)$/;
/** `{@name}` - option names may contain spaces and dots, never braces. */
const OPTION_USAGE = /\{@([^{}\n]+)\}/g;

/**
 * Parses the top-level `options:` block into name/value entries. The block
 * runs until the next non-blank, non-comment line that is back at column 0.
 * A nested entry (indented deeper than the block's first entry) is recorded
 * under a dotted path, e.g. `parent.child`; a bare `parent:` header with no
 * value isn't an option itself.
 */
export function parseOptions(document: vscode.TextDocument, rawLines: string[]): OptionInfo[] {
  const options: OptionInfo[] = [];

  for (let lineNo = 0; lineNo < rawLines.length; lineNo++) {
    const header = stripComment(rawLines[lineNo]);
    if (!OPTIONS_HEADER.test(header)) continue;

    const sections: { indent: number; name: string }[] = [];
    for (let i = lineNo + 1; i < rawLines.length; i++) {
      const code = stripComment(rawLines[i]);
      if (code.trim().length === 0) continue;
      const indent = code.length - code.trimStart().length;
      if (indent === 0) break;
      lineNo = i;

      while (sections.length > 0 && sections[sections.length - 1].indent >= indent) sections.pop();

      const m = OPTION_ENTRY.exec(code.trimStart());
      if (!m) continue;

      const localName = m[1];
      const value = m[2].trim();
      sections.push({ indent, name: localName });
      if (value.length === 0) continue;

      const nameStart = indent;
      const parents = sections.slice(0, -1).map((s) => s.name);
      options.push({
        name: [...parents, localName].join("."),
        value,
        uri: document.uri,
        nameRange: new vscode.Range(i, nameStart, i, nameStart + localName.length),
      });
    }
  }

  return options;
}

/** Finds every `{@name}` reference outside `#` comments (including inside strings, where Skript also substitutes options). */
export function parseOptionUsages(rawLines: string[]): OptionUsage[] {
  const usages: OptionUsage[] = [];
  for (let lineNo = 0; lineNo < rawLines.length; lineNo++) {
    const code = stripComment(rawLines[lineNo]);
    if (!code.includes("{@")) continue;
    OPTION_USAGE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = OPTION_USAGE.exec(code))) {
      const nameStart = match.index + 2;
      const name = match[1].trim();
      usages.push({
        name,
        nameRange: new vscode.Range(lineNo, nameStart, lineNo, nameStart + match[1].length),
        range: new vscode.Range(lineNo, match.index, lineNo, match.index + match[0].length),
      });
    }
  }
  return usages;
}

function stripComment(line: string): string {
  const idx = findCommentStart(line);
  return (idx === -1 ? line : line.slice(0, idx)).trimEnd();
}
