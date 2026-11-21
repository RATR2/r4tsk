import * as vscode from "vscode";
import { parseDocument } from "./parseDocument";
import { FunctionInfo, ParsedDocument } from "./types";

export class WorkspaceIndex {
  private readonly docs = new Map<string, ParsedDocument>();
  /**
   * Documents opened from outside every workspace folder (e.g. a file from an
   * unrelated project restored in an editor tab). They are parsed so they can
   * be diagnosed on their own, but kept out of `docs` so their functions don't
   * leak into other projects' duplicate/undefined-function checks, completion
   * and go-to-definition.
   */
  private readonly external = new Map<string, ParsedDocument>();
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
    const target = this.isInWorkspace(document.uri) ? this.docs : this.external;
    const existing = target.get(key);
    if (existing && existing.version === document.version) return;
    target.set(key, parseDocument(document));
    this.onDidChangeEmitter.fire();
  }

  /** With no workspace folder open at all, every file counts as in-workspace (single-file mode). */
  private isInWorkspace(uri: vscode.Uri): boolean {
    if (!vscode.workspace.workspaceFolders?.length) return true;
    return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
  }

  removeDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    if (this.docs.delete(key) || this.external.delete(key)) {
      this.onDidChangeEmitter.fire();
    }
  }

  /** Drops an out-of-workspace document once it's closed; workspace documents stay indexed. */
  forgetExternal(uri: vscode.Uri): void {
    if (this.external.delete(uri.toString())) {
      this.onDidChangeEmitter.fire();
    }
  }

  getParsed(uri: vscode.Uri): ParsedDocument | undefined {
    const key = uri.toString();
    return this.docs.get(key) ?? this.external.get(key);
  }

  getAllParsed(): ParsedDocument[] {
    return Array.from(this.docs.values());
  }

  /**
   * All functions matching `name` that are visible from `fromUri` - a
   * `local function` is only visible within its own file, so it's excluded
   * unless `fromUri` is that same file. Without a `fromUri` (no calling
   * context), locals are excluded entirely, since none can be assumed visible.
   */
  findFunctions(name: string, fromUri?: vscode.Uri): FunctionInfo[] {
    const lower = name.toLowerCase();
    const results: FunctionInfo[] = [];
    const searched: Iterable<ParsedDocument> = this.docsVisibleFrom(fromUri);
    for (const doc of searched) {
      for (const fn of doc.functions) {
        if (fn.name.toLowerCase() !== lower) continue;
        if (fn.isLocal && fn.uri.toString() !== fromUri?.toString()) continue;
        results.push(fn);
      }
    }
    return results;
  }

  /** Workspace documents, plus `fromUri`'s own document when it lives outside the workspace (so a lone file still resolves its own functions). */
  private docsVisibleFrom(fromUri?: vscode.Uri): ParsedDocument[] {
    const docs = Array.from(this.docs.values());
    const own = fromUri ? this.external.get(fromUri.toString()) : undefined;
    if (own) docs.push(own);
    return docs;
  }

  /** First matching function visible from `preferUri`, preferring that same document if it defines one. */
  resolveFunction(name: string, preferUri?: vscode.Uri): FunctionInfo | undefined {
    const matches = this.findFunctions(name, preferUri);
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

  /** All functions visible from `fromUri` - every global function, plus `fromUri`'s own local ones. For workspace-wide autocomplete, where offering another file's local function would suggest something uncallable. */
  getVisibleFunctions(fromUri: vscode.Uri): FunctionInfo[] {
    return this.getAllFunctions().filter((fn) => !fn.isLocal || fn.uri.toString() === fromUri.toString());
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
