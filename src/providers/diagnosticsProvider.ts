import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { findBuiltinFunction } from "../data/skriptSyntax";
import { DocsHolder } from "../data/docsHolder";
import { CrossVersionIndex } from "../data/crossVersionIndex";
import { DocsDatabase } from "../data/docsDatabase";
import { maskLine, maskVariableBraces } from "../utils/textScanning";

// Includes hyphens so compound pseudo-identifiers like `loop-value` or
// `event-block` are scanned as one token, not split into `loop`/`value`
// (which would then wrongly match an unrelated "value of" expression, etc).
const CODE_WORD = /[a-zA-Z][a-zA-Z'-]*/g;

export class DiagnosticsManager {
  private readonly collection = vscode.languages.createDiagnosticCollection("r4tsk");

  constructor(
    private readonly index: WorkspaceIndex,
    private readonly docs?: DocsHolder,
    private readonly crossVersion?: CrossVersionIndex
  ) {}

  private enabled(): boolean {
    return vscode.workspace.getConfiguration("r4tsk").get<boolean>("diagnostics.enable", true);
  }

  refresh(document: vscode.TextDocument): void {
    const uri = document.uri;
    if (!this.enabled()) {
      this.collection.delete(uri);
      return;
    }

    const parsed = this.index.getParsed(uri);
    if (!parsed) return;

    const diagnostics: vscode.Diagnostic[] = [];
    const currentDocs = this.docs?.current;

    for (const call of parsed.calls) {
      const fn = this.index.resolveFunction(call.name, uri);
      if (!fn) {
        if (findBuiltinFunction(call.name)) continue;
        if (currentDocs?.lookupWord(call.name)?.category === "function") continue;

        const elsewhere =
          this.crossVersion?.isReady ? this.crossVersion.findElsewhere(call.name, currentDocs?.sourceVersion) : undefined;
        const suggestion =
          elsewhere && elsewhere.entry.category === "function"
            ? ` You might be thinking of '${elsewhere.entry.name}' from Skript ${elsewhere.version}.`
            : "";

        diagnostics.push(
          new vscode.Diagnostic(
            call.nameRange,
            `Undefined function '${call.name}'.${suggestion}`,
            vscode.DiagnosticSeverity.Warning
          )
        );
        continue;
      }

      const required = fn.params.filter((p) => !p.optional).length;
      if (call.args.length > fn.params.length) {
        diagnostics.push(
          new vscode.Diagnostic(
            call.callRange,
            `Too many arguments: '${fn.name}' takes ${fn.params.length}, got ${call.args.length}.`,
            vscode.DiagnosticSeverity.Error
          )
        );
      } else if (call.args.length < required) {
        const missing = fn.params[call.args.length];
        diagnostics.push(
          new vscode.Diagnostic(
            call.callRange,
            `Missing required argument '${missing.name}: ${missing.type}' for '${fn.name}'.`,
            vscode.DiagnosticSeverity.Error
          )
        );
      }
    }

    for (const fn of parsed.functions) {
      const duplicates = this.index
        .findFunctions(fn.name)
        .filter((f) => f.uri.toString() !== uri.toString() || f.nameRange.start.line !== fn.nameRange.start.line);
      if (duplicates.length > 0) {
        const otherFiles = [...new Set(duplicates.map((d) => vscode.workspace.asRelativePath(d.uri)))];
        diagnostics.push(
          new vscode.Diagnostic(
            fn.nameRange,
            `Duplicate function '${fn.name}', also defined in: ${otherFiles.join(", ")}.`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }

      const paramNames = new Set(fn.params.map((p) => p.name.toLowerCase()));
      for (const docParamName of fn.doc.params.keys()) {
        if (!paramNames.has(docParamName)) {
          diagnostics.push(
            new vscode.Diagnostic(
              fn.nameRange,
              `Doc comment has '@param ${docParamName}' but '${fn.name}' has no such parameter.`,
              vscode.DiagnosticSeverity.Warning
            )
          );
        }
      }

      if (fn.doc.returns && !fn.returnType) {
        diagnostics.push(
          new vscode.Diagnostic(
            fn.nameRange,
            `Doc comment has '@return' but '${fn.name}' doesn't declare a return type (missing ':: type' before the ':').`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    this.scanCodeUsage(document, diagnostics, currentDocs);

    this.collection.set(uri, diagnostics);
  }

  /**
   * Word-level scan (same heuristic as hover) over each line's actual code
   * content - excluding comments, string literals and `{variable}` names -
   * flagging deprecated syntax usage. Skips entries whose name also exists,
   * non-deprecated, elsewhere (same version or a nearby one) - that means
   * the feature was reorganized (e.g. an old condition folded into a newer
   * "property" system) with identical syntax, not actually going away, so
   * there's nothing for the user to act on.
   */
  private scanCodeUsage(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
    currentDocs: DocsDatabase | undefined
  ): void {
    if (!currentDocs) return;

    for (let line = 0; line < document.lineCount; line++) {
      const codeOnly = maskVariableBraces(maskLine(document.lineAt(line).text));

      CODE_WORD.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CODE_WORD.exec(codeOnly))) {
        const word = match[0];
        const entry = currentDocs.lookupWord(word);
        if (!entry?.deprecated) continue;
        if (
          this.crossVersion?.isReady &&
          this.crossVersion.hasNonDeprecatedElsewhere(entry.name, currentDocs.sourceVersion)
        )
          continue;

        const range = new vscode.Range(line, match.index, line, match.index + word.length);
        diagnostics.push(
          new vscode.Diagnostic(
            range,
            `'${entry.name}' is deprecated in Skript ${currentDocs.sourceVersion}. Please use the newer alternative described in its docs.`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
