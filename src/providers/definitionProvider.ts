import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { parseDocument } from "../parser/parseDocument";

export class SkriptDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Definition | undefined {
    const parsed = parseDocument(document);
    const call = parsed.calls.find((c) => c.nameRange.contains(position));
    if (!call) return undefined;

    const fn = this.index.resolveFunction(call.name, document.uri);
    if (!fn) return undefined;

    return new vscode.Location(fn.uri, fn.nameRange);
  }
}

export class SkriptReferenceProvider implements vscode.ReferenceProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext
  ): vscode.Location[] {
    const parsed = parseDocument(document);
    const def = parsed.functions.find((f) => f.nameRange.contains(position));
    const call = parsed.calls.find((c) => c.nameRange.contains(position));
    const name = def?.name ?? call?.name;
    if (!name) return [];

    const locations: vscode.Location[] = [];
    for (const doc of this.index.getAllParsed()) {
      for (const c of doc.calls) {
        if (c.name.toLowerCase() === name.toLowerCase()) {
          locations.push(new vscode.Location(doc.uri, c.nameRange));
        }
      }
      if (context.includeDeclaration) {
        for (const f of doc.functions) {
          if (f.name.toLowerCase() === name.toLowerCase()) {
            locations.push(new vscode.Location(doc.uri, f.nameRange));
          }
        }
      }
    }
    return locations;
  }
}
