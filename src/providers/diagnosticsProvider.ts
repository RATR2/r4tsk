import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { findBuiltinFunction } from "../data/skriptSyntax";
import { findAddonFunctions, parseSignature } from "../data/addonFunctions";
import { DocsHolder } from "../data/docsHolder";
import { CrossVersionIndex } from "../data/crossVersionIndex";
import { DocsDatabase } from "../data/docsDatabase";
import { experimentDiagnostics, missingExperimentDiagnostics } from "./experimentalFeatures";
import { findUnrecognizedLines } from "../parser/unrecognizedSyntax";
import { FunctionCallSite } from "../parser/types";
import { maskLine, maskVariableBraces } from "../utils/textScanning";

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

  /** Function names the user declared as defined elsewhere (e.g. from an addon not covered by the bundled list). */
  private knownFunctions(): Set<string> {
    const names = vscode.workspace.getConfiguration("r4tsk").get<string[]>("knownFunctions", []);
    return new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => n.length > 0));
  }

  /**
   * For a call to a known addon function, checks the argument count against
   * its signature - as a Warning only, and only when the signature is
   * reliable (every parameter parsed, no list-typed parameter) and no
   * same-named function exists in core Skript's docs (core wins). With
   * several addons defining the name, the call is fine if any signature fits.
   * Returns whether the name is a known addon function.
   */
  private checkAddonCall(
    call: FunctionCallSite,
    diagnostics: vscode.Diagnostic[],
    currentDocs: DocsDatabase | undefined
  ): boolean {
    const candidates = findAddonFunctions(call.name);
    if (candidates.length === 0) return false;
    if (currentDocs?.findFunctionEntries(call.name).some((e) => !e.id.startsWith("skripthub:"))) return true;

    const parsed = candidates.map((c) => parseSignature(c.signature));
    if (parsed.some((p) => !p || !p.reliable)) return true;

    const fits = parsed.some((p) => {
      const params = p!.params;
      const required = params.filter((x) => !x.optional).length;
      return call.args.length >= required && call.args.length <= params.length;
    });
    if (fits) return true;

    const first = parsed[0]!;
    const required = first.params.filter((x) => !x.optional).length;
    const addons = [...new Set(candidates.flatMap((c) => c.addons))].join("/");
    const takes =
      candidates.length > 1
        ? "has no signature taking that many arguments"
        : required === first.params.length
          ? `takes ${required}`
          : `takes ${required} to ${first.params.length}`;
    diagnostics.push(
      new vscode.Diagnostic(
        call.callRange,
        `'${candidates[0].name}' (${addons}) ${takes}; got ${call.args.length}.`,
        vscode.DiagnosticSeverity.Warning
      )
    );
    return true;
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
    const knownFunctions = this.knownFunctions();

    for (const call of parsed.calls) {
      const fn = this.index.resolveFunction(call.name, uri);
      if (!fn) {
        if (findBuiltinFunction(call.name)) continue;
        if (this.checkAddonCall(call, diagnostics, currentDocs)) continue;
        if (knownFunctions.has(call.name.toLowerCase())) continue;
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
      // A `local function` only collides with something of the same name
      // declared in the *same* file - a same-named local (or even global)
      // function in another script is a separate, unrelated function, not a
      // conflict. Cross-file collisions only matter when both are global,
      // since that's the only case where they'd actually share a namespace.
      const duplicates = this.index
        .findFunctions(fn.name, uri)
        .filter((f) => {
          const isSelf = f.uri.toString() === uri.toString() && f.nameRange.start.line === fn.nameRange.start.line;
          if (isSelf) return false;
          const sameFile = f.uri.toString() === uri.toString();
          return sameFile || (!fn.isLocal && !f.isLocal);
        });
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
    diagnostics.push(...experimentDiagnostics(parsed, currentDocs), ...missingExperimentDiagnostics(document, parsed, currentDocs));

    const definedOptions = new Set(parsed.options.map((o) => o.name));
    for (const usage of parsed.optionUsages) {
      if (definedOptions.has(usage.name)) continue;
      diagnostics.push(
        new vscode.Diagnostic(usage.nameRange, `Undefined option '${usage.name}'.`, vscode.DiagnosticSeverity.Warning)
      );
    }
    this.scanUnrecognizedSyntax(document, diagnostics, currentDocs);

    this.collection.set(uri, diagnostics);
  }

  /**
   * Scans each line's actual code content - excluding comments, string
   * literals and `{variable}` names - for a real match of a deprecated
   * pattern, anywhere within the line (not just when it's the line's whole
   * content, since a deprecated expression can appear embedded as a
   * sub-argument of something else). Deliberately *not* a bare keyword scan:
   * a single shared word (e.g. "display" also being a literal entity type,
   * "item display", and an unrelated property, "display scale") isn't
   * enough - the pattern's actual required text has to appear together.
   * Skips entries whose name also exists, non-deprecated, elsewhere (same
   * version or a nearby one) - that means the feature was reorganized (e.g.
   * an old condition folded into a newer "property" system) with identical
   * syntax, not actually going away, so there's nothing for the user to act on.
   */
  private scanCodeUsage(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
    currentDocs: DocsDatabase | undefined
  ): void {
    if (!currentDocs) return;

    for (let line = 0; line < document.lineCount; line++) {
      const codeOnly = maskVariableBraces(maskLine(document.lineAt(line).text));

      for (const { entry, index, length } of currentDocs.findDeprecatedUsages(codeOnly)) {
        if (
          this.crossVersion?.isReady &&
          this.crossVersion.hasNonDeprecatedElsewhere(entry.name, currentDocs.sourceVersion)
        )
          continue;

        const range = new vscode.Range(line, index, line, index + length);
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

  private scanUnrecognizedSyntax(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
    currentDocs: DocsDatabase | undefined
  ): void {
    const mode = vscode.workspace.getConfiguration("r4tsk").get<string>("diagnostics.unrecognizedSyntax", "information");
    if (mode === "off" || !currentDocs) return;
    const severity = mode === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;

    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);

    for (const { line, start, end } of findUnrecognizedLines(lines, currentDocs)) {
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(line, start, line, end),
        "Skript may not understand this line.",
        severity
      );
      diagnostic.code = "unrecognizedSyntax";
      diagnostics.push(diagnostic);
    }
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
