import * as vscode from "vscode";
import { SIGNATURE_BANNER_PATTERNS } from "../data/signatureBanner";

export interface CustomPatternRule {
  pattern: string;
  color: string;
  background?: string;
  flags?: string;
  bold?: boolean;
  italic?: boolean;
}

interface CompiledRule {
  regex: RegExp;
  type: vscode.TextEditorDecorationType;
}

/**
 * Colors regex patterns anywhere in the document: r4tsk's built-in
 * signature banner (always active, not user-configurable - see
 * `data/signatureBanner.ts`) plus whatever the user adds via
 * `r4tsk.customPatterns`. Matches across the whole document text (not just
 * comments), so multi-line patterns work too.
 */
export class CustomPatternDecorator {
  private readonly decorationTypes: vscode.TextEditorDecorationType[] = [];
  private rules: CompiledRule[] = [];

  constructor() {
    this.rebuildTypes();
  }

  isRelevantConfigChange(e: vscode.ConfigurationChangeEvent): boolean {
    return e.affectsConfiguration("r4tsk.customPatterns");
  }

  rebuildTypes(): void {
    for (const type of this.decorationTypes) type.dispose();
    this.decorationTypes.length = 0;
    this.rules = [];

    const configured = vscode.workspace.getConfiguration("r4tsk").get<CustomPatternRule[]>("customPatterns", []);
    for (const rule of [...SIGNATURE_BANNER_PATTERNS, ...configured]) {
      if (!rule?.pattern || !rule.color) continue;

      let regex: RegExp;
      try {
        const flags = (rule.flags ?? "").replace(/g/g, "") + "g";
        regex = new RegExp(rule.pattern, flags);
      } catch {
        continue; // invalid user-supplied regex - skip it rather than break everything else
      }

      const type = vscode.window.createTextEditorDecorationType({
        color: rule.color,
        backgroundColor: rule.background || undefined,
        fontWeight: rule.bold ? "bold" : undefined,
        fontStyle: rule.italic ? "italic" : undefined,
      });
      this.decorationTypes.push(type);
      this.rules.push({ regex, type });
    }
  }

  refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== "skript") return;
    if (this.rules.length === 0) return;

    const text = editor.document.getText();

    for (const { regex, type } of this.rules) {
      const ranges = matchRanges(regex, text, editor.document);
      editor.setDecorations(type, ranges);
    }
  }

  /**
   * Every line number touched by at least one custom pattern match (banner
   * or user-defined), for this document. Lets other decorators (like the
   * generic TODO/WARN/! annotation scanner) avoid double-coloring lines
   * that are already claimed by a custom pattern - e.g. the many literal
   * `!` characters in an ASCII-art banner shouldn't also get treated as
   * "important" markers.
   */
  getMatchedLineSet(document: vscode.TextDocument): Set<number> {
    const lines = new Set<number>();
    if (document.languageId !== "skript") return lines;

    const text = document.getText();
    for (const { regex } of this.rules) {
      for (const range of matchRanges(regex, text, document)) {
        for (let line = range.start.line; line <= range.end.line; line++) lines.add(line);
      }
    }
    return lines;
  }

  dispose(): void {
    for (const type of this.decorationTypes) type.dispose();
    this.decorationTypes.length = 0;
  }
}

function matchRanges(regex: RegExp, text: string, document: vscode.TextDocument): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[0].length === 0) {
      regex.lastIndex++;
      continue;
    }
    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + match[0].length);
    ranges.push(new vscode.Range(start, end));
  }
  return ranges;
}
