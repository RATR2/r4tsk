import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { maskLine, splitTopLevel } from "../utils/textScanning";
import { findBuiltinFunction } from "../data/skriptSyntax";
import { renderDocMarkdown } from "../utils/docFormat";

export class SkriptSignatureHelpProvider implements vscode.SignatureHelpProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.SignatureHelp | undefined {
    const line = document.lineAt(position.line).text;
    const masked = maskLine(line).slice(0, position.character);

    const openIdx = findEnclosingOpenParen(masked);
    if (openIdx === -1) return undefined;

    const nameMatch = /([a-zA-Z_][a-zA-Z0-9_]*)\s*$/.exec(masked.slice(0, openIdx));
    if (!nameMatch) return undefined;
    const name = nameMatch[1];

    const argsSoFar = masked.slice(openIdx + 1);
    const activeParam = splitTopLevel(argsSoFar).length - 1;

    const fn = this.index.resolveFunction(name, document.uri);
    if (fn) {
      const sig = new vscode.SignatureInformation(fn.signatureLabel, renderDocMarkdown(fn.doc, fn.params));
      sig.parameters = fn.params.map((p) => {
        const paramDoc = fn.doc.params.get(p.name.toLowerCase());
        return new vscode.ParameterInformation(
          `${p.name}: ${p.type}`,
          paramDoc ? new vscode.MarkdownString(paramDoc) : undefined
        );
      });
      const help = new vscode.SignatureHelp();
      help.signatures = [sig];
      help.activeSignature = 0;
      help.activeParameter = Math.max(0, Math.min(activeParam, fn.params.length - 1));
      return help;
    }

    const builtin = findBuiltinFunction(name);
    if (builtin) {
      const label = `${builtin.name}(${builtin.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) :: ${builtin.returnType}`;
      const sig = new vscode.SignatureInformation(label, builtin.description);
      sig.parameters = builtin.params.map((p) => new vscode.ParameterInformation(`${p.name}: ${p.type}`));
      const help = new vscode.SignatureHelp();
      help.signatures = [sig];
      help.activeSignature = 0;
      help.activeParameter = Math.max(0, Math.min(activeParam, builtin.params.length - 1));
      return help;
    }

    return undefined;
  }
}

/** Finds the index of the innermost unmatched `(` in `text`, or -1. */
function findEnclosingOpenParen(text: string): number {
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") stack.push(i);
    else if (text[i] === ")") stack.pop();
  }
  return stack.length > 0 ? stack[stack.length - 1] : -1;
}
