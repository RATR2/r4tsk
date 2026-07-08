import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import {
  BUILTIN_CONDITIONS,
  BUILTIN_EFFECTS,
  BUILTIN_EVENTS,
  BUILTIN_FUNCTIONS,
  BUILTIN_TYPES,
} from "../data/skriptSyntax";
import { renderDocMarkdown } from "../utils/docFormat";

export class SkriptCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const items: vscode.CompletionItem[] = [];

    if (/^\s*on\s+[a-zA-Z ]*$/.test(linePrefix)) {
      for (const ev of BUILTIN_EVENTS) {
        const item = new vscode.CompletionItem(ev.name, vscode.CompletionItemKind.Event);
        item.detail = ev.pattern;
        item.documentation = ev.description;
        item.insertText = new vscode.SnippetString(`${ev.name}:\n\t$0`);
        items.push(item);
      }
      return items;
    }

    if (/^\s*(if|else if)\s+[\w ]*$/i.test(linePrefix)) {
      for (const cond of BUILTIN_CONDITIONS) {
        const item = new vscode.CompletionItem(cond.name, vscode.CompletionItemKind.Keyword);
        item.detail = cond.pattern;
        item.documentation = cond.description;
        items.push(item);
      }
    }

    if (/%[a-zA-Z ]*$/.test(linePrefix)) {
      for (const type of BUILTIN_TYPES) {
        const item = new vscode.CompletionItem(type.name, vscode.CompletionItemKind.TypeParameter);
        item.documentation = type.description;
        items.push(item);
      }
    }

    const isLineStart = /^\s*[a-zA-Z]*$/.test(linePrefix);
    if (isLineStart) {
      for (const eff of BUILTIN_EFFECTS) {
        const item = new vscode.CompletionItem(eff.name, vscode.CompletionItemKind.Function);
        item.detail = eff.pattern;
        item.documentation = eff.description;
        items.push(item);
      }
    }

    for (const fn of this.index.getAllFunctions()) {
      const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
      item.detail = fn.signatureLabel;
      item.documentation = renderDocMarkdown(fn.doc, fn.params);
      const placeholders = fn.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
      item.insertText = new vscode.SnippetString(`${fn.name}(${placeholders})`);
      items.push(item);
    }

    for (const bf of BUILTIN_FUNCTIONS) {
      const item = new vscode.CompletionItem(bf.name, vscode.CompletionItemKind.Function);
      item.detail = `${bf.name}(${bf.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) :: ${bf.returnType}`;
      item.documentation = bf.description;
      const placeholders = bf.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
      item.insertText = new vscode.SnippetString(`${bf.name}(${placeholders})`);
      items.push(item);
    }

    for (const varName of this.collectVariableNames(document)) {
      const item = new vscode.CompletionItem(varName, vscode.CompletionItemKind.Variable);
      items.push(item);
    }

    return items;
  }

  private collectVariableNames(document: vscode.TextDocument): Set<string> {
    const names = new Set<string>();
    const text = document.getText();
    const re = /\{(_?[a-zA-Z][\w:.*]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      names.add(match[1]);
    }
    return names;
  }
}
