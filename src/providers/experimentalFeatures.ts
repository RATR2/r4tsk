import * as vscode from "vscode";
import { DocsDatabase, LineMatch } from "../data/docsDatabase";
import { maskLine, maskVariableBraces } from "../utils/textScanning";
import { DocEntry } from "../data/docsTypes";
import { ParsedDocument } from "../parser/types";

/**
 * Support for Skript's experimental language features, which a script opts
 * into with a top-level `using <feature>` line (e.g. `using script reflection`).
 * The feature list comes from the docs.json `experiments` category.
 *
 * "Missing `using X`" warnings: docs.json has no structured field linking a
 * syntax entry to its experiment. The only machine-readable signal is the
 * description text of a few entries ("Requires the `using queues` experimental
 * feature flag to be enabled"), so only entries stating that explicitly -
 * with a feature that exists in the docs `experiments` list, are checked.
 */

const REQUIRES_USING = /requires the\s+(?:<code>|`)using\s+([^<`]+?)(?:<\/code>|`)\s+experimental feature/i;

/** The documented experiment a syntax entry explicitly says it requires, if any. */
export function requiredExperiment(entry: DocEntry, docs: DocsDatabase): DocEntry | undefined {
  if (entry.category === "experiment") return undefined;
  const m = REQUIRES_USING.exec(entry.description);
  return m ? docs.matchExperiment(m[1]) : undefined;
}

/** Warnings for code that needs an experiment the script never enables with `using`. */
export function missingExperimentDiagnostics(
  document: vscode.TextDocument,
  parsed: ParsedDocument,
  docs: DocsDatabase | undefined
): vscode.Diagnostic[] {
  if (!docs || !experimentalNoticeEnabled()) return [];
  const experiments = docs.getExperiments();
  if (experiments.length === 0) return [];

  const enabled = new Set<string>();
  for (const u of parsed.usings) {
    const e = docs.matchExperiment(u.feature);
    if (e) enabled.add(e.uid);
  }

  const out: vscode.Diagnostic[] = [];
  const usingLines = new Set(parsed.usings.map((u) => u.lineRange.start.line));
  for (let line = 0; line < document.lineCount; line++) {
    if (usingLines.has(line)) continue;
    const code = maskVariableBraces(maskLine(document.lineAt(line).text));
    if (!code.trim()) continue;

    // Whole-line matches: if the line is exactly an experimental entry AND exactly some
    // non-experimental one, it is ambiguous, so stay quiet.
    const all: LineMatch[] = [];
    docs.matchLine(code, undefined, all);
    const wholeGated = all.filter((m) => requiredExperiment(m.entry, docs));
    if (wholeGated.length > 0 && wholeGated.length < all.length) continue;

    // Then embedded usages (`set {_q} to a new queue of 1`). A gated hit is dropped when a
    // non-gated entry matches about the same span (the syntax may be valid without `using`).
    const hits = docs.findSubstringUsages(code);
    const gated = hits
      .map((h) => ({ h, need: requiredExperiment(h.entry, docs) }))
      .filter((g): g is { h: (typeof hits)[number]; need: DocEntry } => !!g.need);
    const wholeLineGated = wholeGated.length > 0 ? requiredExperiment(wholeGated[0].entry, docs) : undefined;
    if (gated.length === 0 && !wholeLineGated) continue;

    const confirmed = gated.filter(({ h }) =>
      !hits.some(
        (o) =>
          !requiredExperiment(o.entry, docs) &&
          o.index >= h.index &&
          o.index + o.length <= h.index + h.length &&
          o.length >= h.length * 0.6
      )
    );
    const needs = new Set<DocEntry>();
    for (const c of confirmed) needs.add(c.need);
    if (needs.size === 0 && wholeLineGated && gated.length === 0) needs.add(wholeLineGated);
    if (needs.size !== 1) continue;
    const first = [...needs][0];
    if (enabled.has(first.uid)) continue;

    const start = code.length - code.trimStart().length;
    const end = code.trimEnd().length;
    out.push(
      new vscode.Diagnostic(
        new vscode.Range(line, start, line, end),
        `You're missing the experimental feature \`${first.id}\`. Add \`using ${first.id}\` at the top of the script.`,
        vscode.DiagnosticSeverity.Warning
      )
    );
  }
  return out;
}

export function experimentalNoticeEnabled(): boolean {
  return vscode.workspace.getConfiguration("r4tsk").get<boolean>("diagnostics.experimentalNotice", true);
}

/** Information-level diagnostics for `using <feature>` lines naming a feature the docs don't list. */
export function experimentDiagnostics(parsed: ParsedDocument, docs: DocsDatabase | undefined): vscode.Diagnostic[] {
  if (!docs || !experimentalNoticeEnabled()) return [];
  // Without any experiments in the loaded docs (older docs.json files) we can't tell known from unknown.
  if (docs.getExperiments().length === 0) return [];

  const out: vscode.Diagnostic[] = [];
  for (const using of parsed.usings) {
    if (docs.matchExperiment(using.feature)) continue;
    out.push(
      new vscode.Diagnostic(
        using.featureRange,
        `Unknown experimental feature '${using.feature}' (not listed in the loaded Skript ${docs.sourceVersion} docs).`,
        vscode.DiagnosticSeverity.Information
      )
    );
  }
  return out;
}

function featureLabel(entry: DocEntry): string {
  return entry.name;
}

export function experimentHover(
  parsed: ParsedDocument,
  position: vscode.Position,
  docs: DocsDatabase | undefined
): vscode.Hover | undefined {
  if (!docs) return undefined;
  const using = parsed.usings.find((u) => u.lineRange.contains(position));
  if (!using) return undefined;
  const entry = docs.matchExperiment(using.feature);
  if (!entry) return undefined;

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**Experimental feature: ${featureLabel(entry)}**\n\n`);
  if (entry.description) md.appendMarkdown(`${entry.description}\n\n`);
  md.appendMarkdown(`*Added in Skript ${entry.since ?? "?"}*`);
  return new vscode.Hover(md, using.featureRange);
}

/** Completion items for the feature name after `using `, or undefined when the cursor isn't there. */
export function experimentCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  docs: DocsDatabase | undefined
): vscode.CompletionItem[] | undefined {
  const prefix = document.lineAt(position.line).text.slice(0, position.character);
  const m = /^using\s+([\w ]*)$/i.exec(prefix);
  if (!m || !docs) return undefined;

  const typedStart = position.character - m[1].length;
  const range = new vscode.Range(position.line, typedStart, position.line, position.character);
  return docs.getExperiments().map((entry) => {
    const item = new vscode.CompletionItem(entry.id, vscode.CompletionItemKind.Keyword);
    item.detail = featureLabel(entry);
    item.documentation = new vscode.MarkdownString(entry.description);
    item.range = range;
    return item;
  });
}
