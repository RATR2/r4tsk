import * as vscode from "vscode";
import { parseDocument } from "./parseDocument";
import { FunctionInfo, ParsedDocument } from "./types";

/** Cheap content fingerprint (length plus FNV-1a hash) used to tell whether a document's text actually changed. */
function contentSignature(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${hash >>> 0}`;
}

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
  /**
   * Content signature of each indexed document. A document's `version` isn't
   * enough to detect changes: a file edited outside the editor and re-opened
   * from disk starts again at version 1, so it looks unchanged.
   */
  private readonly signatures = new Map<string, string>();
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
    const inWorkspace = this.isInWorkspace(document.uri);
    const target = inWorkspace ? this.docs : this.external;
    const other = inWorkspace ? this.external : this.docs;
    // A document lives in exactly one map; drop a stale entry in the other one (e.g. after a workspace folder was added).
    other.delete(key);
    const existing = target.get(key);
    const signature = contentSignature(document.getText());
    if (existing && existing.version === document.version && this.signatures.get(key) === signature) return;
    this.signatures.set(key, signature);
    target.set(key, parseDocument(document));
    this.onDidChangeEmitter.fire();
  }

  /**
   * Re-sorts documents after workspace folders were added or removed, then
   * indexes any files in newly added folders. Documents that left the
   * workspace are dropped, or kept as external if they are still open.
   */
  async refreshWorkspaceFolders(): Promise<void> {
    const openKeys = new Set(vscode.workspace.textDocuments.map((d) => d.uri.toString()));
    for (const [key, parsed] of Array.from(this.docs)) {
      if (this.isInWorkspace(parsed.uri)) continue;
      this.docs.delete(key);
      if (openKeys.has(key)) this.external.set(key, parsed);
    }
    for (const [key, parsed] of Array.from(this.external)) {
      if (!this.isInWorkspace(parsed.uri)) continue;
      this.external.delete(key);
      this.docs.set(key, parsed);
    }
    await this.initialize();
  }

  /** With no workspace folder open at all, every file counts as in-workspace (single-file mode). */
  private isInWorkspace(uri: vscode.Uri): boolean {
    if (!vscode.workspace.workspaceFolders?.length) return true;
    return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
  }

  removeDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    this.signatures.delete(key);
    if (this.docs.delete(key) || this.external.delete(key)) {
      this.onDidChangeEmitter.fire();
    }
  }

  /**
   * Called when a document is closed. Out-of-workspace documents are dropped.
   * With no workspace folder open, every document is a loose open file with no
   * project behind it, so a closed one is dropped too; otherwise a closed
   * workspace document stays indexed because it is still part of the project.
   */
  forgetClosed(uri: vscode.Uri): void {
    const key = uri.toString();
    const removedExternal = this.external.delete(key);
    const removedLoose = !vscode.workspace.workspaceFolders?.length && this.docs.delete(key);
    if (removedExternal || removedLoose) {
      this.signatures.delete(key);
      this.onDidChangeEmitter.fire();
    }
  }

  getParsed(uri: vscode.Uri): ParsedDocument | undefined {
    const key = uri.toString();
    return this.docs.get(key) ?? this.external.get(key);
  }

  /** Every indexed document, or - given `fromUri` - only those visible from it (just itself for an out-of-workspace file). */
  getAllParsed(fromUri?: vscode.Uri): ParsedDocument[] {
    return this.docsVisibleFrom(fromUri);
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

  /**
   * Documents visible from `fromUri`. A file outside the workspace sees only
   * itself, so a same-named function in the workspace can't make it look like
   * a duplicate; everything else sees the workspace documents.
   */
  private docsVisibleFrom(fromUri?: vscode.Uri): ParsedDocument[] {
    const own = fromUri ? this.external.get(fromUri.toString()) : undefined;
    return own ? [own] : Array.from(this.docs.values());
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

  /** All functions visible from `fromUri` (see `docsVisibleFrom`) - every global function, plus `fromUri`'s own local ones. For workspace-wide autocomplete, where offering another file's local function would suggest something uncallable. */
  getVisibleFunctions(fromUri: vscode.Uri): FunctionInfo[] {
    return this.docsVisibleFrom(fromUri)
      .flatMap((doc) => doc.functions)
      .filter((fn) => !fn.isLocal || fn.uri.toString() === fromUri.toString());
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
