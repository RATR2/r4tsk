import * as vscode from "vscode";
import { findStringContentRanges } from "../utils/textScanning";

const HEX_TAG = /<#([0-9a-fA-F]{6})>/g;

/**
 * Lets VS Code's built-in color swatch/picker work on Skript's `<#rrggbb>`
 * hex color tags. The default color detection VS Code falls back to when a
 * language has no DocumentColorProvider only recognizes a bare `#rrggbb`
 * with nothing around it, so it never matches Skript's `<...>` wrapper.
 */
export class SkriptColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(document: vscode.TextDocument): vscode.ColorInformation[] {
    const results: vscode.ColorInformation[] = [];

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      for (const strRange of findStringContentRanges(text)) {
        const content = text.slice(strRange.start, strRange.end);
        HEX_TAG.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = HEX_TAG.exec(content))) {
          const start = strRange.start + match.index;
          const end = start + match[0].length;
          results.push(
            new vscode.ColorInformation(new vscode.Range(line, start, line, end), hexToColor(match[1]))
          );
        }
      }
    }

    return results;
  }

  provideColorPresentations(color: vscode.Color): vscode.ColorPresentation[] {
    return [new vscode.ColorPresentation(`<#${colorToHex(color)}>`)];
  }
}

function hexToColor(hex: string): vscode.Color {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return new vscode.Color(r, g, b, 1);
}

function colorToHex(color: vscode.Color): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
}
