import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { parseDocument } from "../parser/parseDocument";

export class SkriptDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    const parsed = parseDocument(document);
    const symbols: vscode.DocumentSymbol[] = [];

    for (const fn of parsed.functions) {
      symbols.push(
        new vscode.DocumentSymbol(
          fn.name,
          fn.signatureLabel,
          vscode.SymbolKind.Function,
          fn.headerRange,
          fn.nameRange
        )
      );
    }
    for (const cmd of parsed.commands) {
      symbols.push(
        new vscode.DocumentSymbol(
          cmd.name,
          cmd.description ?? "command",
          vscode.SymbolKind.Method,
          cmd.nameRange,
          cmd.nameRange
        )
      );
    }
    for (const ev of parsed.events) {
      symbols.push(
        new vscode.DocumentSymbol(ev.name, "event", vscode.SymbolKind.Event, ev.nameRange, ev.nameRange)
      );
    }

    return symbols;
  }
}

export class SkriptWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly index: WorkspaceIndex) {}

  provideWorkspaceSymbols(query: string): vscode.SymbolInformation[] {
    const lower = query.toLowerCase();
    const results: vscode.SymbolInformation[] = [];

    for (const doc of this.index.getAllParsed()) {
      for (const fn of doc.functions) {
        if (!lower || fn.name.toLowerCase().includes(lower)) {
          results.push(
            new vscode.SymbolInformation(
              fn.name,
              vscode.SymbolKind.Function,
              "",
              new vscode.Location(doc.uri, fn.nameRange)
            )
          );
        }
      }
      for (const cmd of doc.commands) {
        if (!lower || cmd.name.toLowerCase().includes(lower)) {
          results.push(
            new vscode.SymbolInformation(
              cmd.name,
              vscode.SymbolKind.Method,
              "",
              new vscode.Location(doc.uri, cmd.nameRange)
            )
          );
        }
      }
    }

    return results;
  }
}
