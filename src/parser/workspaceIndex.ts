import * as vscode from "vscode";
import { parseDocument } from "./parseDocument";
import { FunctionInfo, ParsedDocument } from "./types";

export class WorkspaceIndex {
  private readonly docs = new Map<string, ParsedDocument>();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  async initialize(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.sk",
      "**/{node_modules,.git}/**"
    );
    for (const uri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        this.indexDocument(doc);
      } catch {
        // Unreadable file (permissions, binary, etc.) - skip it.
      }
    }
    this.onDidChangeEmitter.fire();
  }

  indexDocument(document: vscode.TextDocument): void {
    if (document.languageId !== "skript") return;
    const key = document.uri.toString();
    const existing = this.docs.get(key);
    if (existing && existing.version === document.version) return;
    this.docs.set(key, parseDocument(document));
    this.onDidChangeEmitter.fire();
  }

  removeDocument(uri: vscode.Uri): void {
    if (this.docs.delete(uri.toString())) {
      this.onDidChangeEmitter.fire();
    }
  }

  getParsed(uri: vscode.Uri): ParsedDocument | undefined {
    return this.docs.get(uri.toString());
  }

  getAllParsed(): ParsedDocument[] {
    return Array.from(this.docs.values());
  }

  /** All functions matching `name`, across the whole workspace. */
  findFunctions(name: string): FunctionInfo[] {
    const lower = name.toLowerCase();
    const results: FunctionInfo[] = [];
    for (const doc of this.docs.values()) {
      for (const fn of doc.functions) {
        if (fn.name.toLowerCase() === lower) results.push(fn);
      }
    }
    return results;
  }

  /** First matching function, preferring the given document if it defines one. */
  resolveFunction(name: string, preferUri?: vscode.Uri): FunctionInfo | undefined {
    const matches = this.findFunctions(name);
    if (matches.length === 0) return undefined;
    if (preferUri) {
      const local = matches.find((m) => m.uri.toString() === preferUri.toString());
      if (local) return local;
    }
    return matches[0];
  }

  getAllFunctions(): FunctionInfo[] {
    const all: FunctionInfo[] = [];
    for (const doc of this.docs.values()) all.push(...doc.functions);
    return all;
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
