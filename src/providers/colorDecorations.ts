import * as vscode from "vscode";
import { findStringContentRanges } from "../utils/textScanning";
import { ColorRun, scanColorRuns } from "../utils/colorCodes";

function decorationKey(run: ColorRun): string {
  return [
    run.color ?? "none",
    run.bold ? 1 : 0,
    run.italic ? 1 : 0,
    run.underline ? 1 : 0,
    run.strikethrough ? 1 : 0,
  ].join("|");
}

function textDecorationCss(run: ColorRun): string | undefined {
  const parts: string[] = [];
  if (run.underline) parts.push("underline");
  if (run.strikethrough) parts.push("line-through");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export class ColorCodeDecorator {
  private readonly decorationTypes = new Map<string, vscode.TextEditorDecorationType>();

  refresh(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== "skript") return;

    const rangesByKey = new Map<string, vscode.Range[]>();
    const runsByKey = new Map<string, ColorRun>();
    const document = editor.document;

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      for (const strRange of findStringContentRanges(text)) {
        const content = text.slice(strRange.start, strRange.end);
        for (const run of scanColorRuns(content)) {
          const key = decorationKey(run);
          const range = new vscode.Range(
            line,
            strRange.start + run.start,
            line,
            strRange.start + run.end
          );
          if (!rangesByKey.has(key)) {
            rangesByKey.set(key, []);
            runsByKey.set(key, run);
          }
          rangesByKey.get(key)!.push(range);
        }
      }
    }

    for (const [key, ranges] of rangesByKey) {
      editor.setDecorations(this.getOrCreateType(key, runsByKey.get(key)!), ranges);
    }

    for (const [key, type] of this.decorationTypes) {
      if (!rangesByKey.has(key)) editor.setDecorations(type, []);
    }
  }

  private getOrCreateType(key: string, run: ColorRun): vscode.TextEditorDecorationType {
    let type = this.decorationTypes.get(key);
    if (type) return type;

    type = vscode.window.createTextEditorDecorationType({
      color: run.color,
      fontWeight: run.bold ? "bold" : undefined,
      fontStyle: run.italic ? "italic" : undefined,
      textDecoration: textDecorationCss(run),
    });
    this.decorationTypes.set(key, type);
    return type;
  }

  dispose(): void {
    for (const type of this.decorationTypes.values()) type.dispose();
    this.decorationTypes.clear();
  }
}
