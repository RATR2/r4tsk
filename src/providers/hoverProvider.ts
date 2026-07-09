import * as vscode from "vscode";
import { WorkspaceIndex } from "../parser/workspaceIndex";
import { parseDocument } from "../parser/parseDocument";
import { FunctionInfo } from "../parser/types";
import { findBuiltinFunction, findBuiltinType } from "../data/skriptSyntax";
import { renderDocMarkdown } from "../utils/docFormat";
import { DocsDatabase, LineMatch, docsSiteUrl } from "../data/docsDatabase";
import { DocEntry } from "../data/docsTypes";
import { DocsHolder } from "../data/docsHolder";
import { CrossVersionIndex } from "../data/crossVersionIndex";

export class SkriptHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly index: WorkspaceIndex,
    private readonly docs: DocsHolder,
    private readonly crossVersion?: CrossVersionIndex
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const parsed = parseDocument(document);

    const call = parsed.calls.find((c) => c.callRange.contains(position));
    if (call) {
      const fn = this.index.resolveFunction(call.name, document.uri);
      if (fn) return buildCallHover(call.args.map((a) => a.text), fn, call.callRange);

      const builtin = findBuiltinFunction(call.name);
      if (builtin) return buildBuiltinCallHover(builtin);
    }

    const def = parsed.functions.find((f) => f.nameRange.contains(position));
    if (def) return buildDefinitionHover(def);

    const docs = this.docs.current;
    if (docs) {
      const lineText = document.lineAt(position.line).text;
      const lineMatch = docs.matchLine(lineText);
      if (lineMatch) {
        const lineRange = new vscode.Range(position.line, 0, position.line, lineText.length);
        return buildLineMatchHover(lineMatch, docs, lineRange);
      }
    }

    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) {
      const word = document.getText(wordRange);

      const docEntry = docs?.lookupWord(word);
      if (docEntry) return buildDocsEntryHover(docEntry, word, docs!, wordRange);

      const type = findBuiltinType(word);
      if (type) {
        const md = new vscode.MarkdownString();
        md.appendCodeblock(type.name, "skript");
        md.appendMarkdown(type.description);
        return new vscode.Hover(md, wordRange);
      }

      const elsewhere = this.crossVersion?.isReady
        ? this.crossVersion.findElsewhere(word, docs?.sourceVersion)
        : undefined;
      if (elsewhere) return buildElsewhereHover(word, elsewhere, docs?.sourceVersion, wordRange);
    }

    return undefined;
  }
}

function buildElsewhereHover(
  word: string,
  match: { entry: DocEntry; version: string },
  currentVersion: string | undefined,
  range: vscode.Range
): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(
    `❓ \`${word}\` wasn't found in Skript ${currentVersion ?? "your configured version"}.\n\n`
  );
  md.appendMarkdown(
    `You might be thinking of **${match.entry.name}** (${CATEGORY_LABELS[match.entry.category]}) from Skript ${match.version}.\n`
  );
  if (match.entry.description) {
    md.appendMarkdown("\n" + match.entry.description + "\n");
  }
  return new vscode.Hover(md, range);
}

const CATEGORY_LABELS: Record<DocEntry["category"], string> = {
  condition: "Condition",
  effect: "Effect",
  expression: "Expression",
  event: "Event",
  structure: "Structure",
  section: "Section",
  type: "Type",
  function: "Function",
  property: "Property",
  experiment: "Experiment",
};

function buildDocsEntryHover(
  entry: DocEntry,
  word: string,
  docs: DocsDatabase,
  range: vscode.Range
): vscode.Hover {
  const md = new vscode.MarkdownString();
  const pattern = docs.displayPattern(entry, word);
  md.appendCodeblock(pattern ?? entry.name, "skript");

  md.appendMarkdown(`**${entry.name}** · ${CATEGORY_LABELS[entry.category]}`);
  if (entry.since) md.appendMarkdown(` · since \`${entry.since}\``);
  md.appendMarkdown("\n");

  if (entry.deprecated) {
    md.appendMarkdown("\n**⚠️ Deprecated**\n");
  }

  if (entry.description) {
    md.appendMarkdown("\n" + entry.description + "\n");
  }

  if (entry.returns) {
    md.appendMarkdown(`\nReturns: \`${entry.returns.name || entry.returns.id}\`\n`);
  }

  if (entry.examples.length > 0) {
    md.appendMarkdown("\n**Example:**");
    md.appendCodeblock(entry.examples[0].trimEnd(), "skript");
  }

  appendDocsFooter(md, entry, docs);

  return new vscode.Hover(md, range);
}

/**
 * Richer hover for a whole line that actually matched a real Skript syntax
 * pattern (not just "some keyword happens to appear on this line") - shows
 * which specific argument text filled each `%placeholder%` slot.
 */
function buildLineMatchHover(lineMatch: LineMatch, docs: DocsDatabase, range: vscode.Range): vscode.Hover {
  const { entry, pattern, values } = lineMatch;
  const md = new vscode.MarkdownString();

  md.appendCodeblock(docs.displayPattern(entry) ?? entry.name, "skript");
  md.appendMarkdown(`**${entry.name}** · ${CATEGORY_LABELS[entry.category]}`);
  if (entry.since) md.appendMarkdown(` · since \`${entry.since}\``);
  md.appendMarkdown("\n");

  if (entry.deprecated) {
    md.appendMarkdown("\n**⚠️ Deprecated**\n");
  }

  if (entry.description) {
    md.appendMarkdown("\n" + entry.description + "\n");
  }

  const rows = pattern.placeholders
    .map((placeholder, i) => ({ placeholder, value: values[i] }))
    .filter((r) => r.value !== undefined);
  if (rows.length > 0) {
    md.appendMarkdown("\n| Type | Value |\n|---|---|\n");
    for (const { placeholder, value } of rows) {
      md.appendMarkdown(`| \`${placeholder.types.join("/")}\` | ${value} |\n`);
    }
  }

  if (entry.returns) {
    md.appendMarkdown(`\nReturns: \`${entry.returns.name || entry.returns.id}\`\n`);
  }

  if (entry.examples.length > 0) {
    md.appendMarkdown("\n**Example:**");
    md.appendCodeblock(entry.examples[0].trimEnd(), "skript");
  }

  appendDocsFooter(md, entry, docs);

  return new vscode.Hover(md, range);
}

/** Source/version footer, plus a link to the entry's page on the official docs site (more examples, full description, related syntax) when one exists for its category. */
function appendDocsFooter(md: vscode.MarkdownString, entry: DocEntry, docs: DocsDatabase): void {
  const siteUrl = docsSiteUrl(entry);
  if (siteUrl) {
    md.appendMarkdown(`\n[📖 Full docs & more examples](${siteUrl})`);
  }
  md.appendMarkdown(`\n\n*From the Skript docs database (${docs.sourceVersion})*`);
}

function buildCallHover(
  argTexts: string[],
  fn: FunctionInfo,
  callRange: vscode.Range
): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(fn.signatureLabel, "skript");

  if (fn.doc.deprecated) {
    md.appendMarkdown(`\n**⚠️ Deprecated:** ${fn.doc.deprecated}\n`);
  }
  if (fn.doc.description) {
    md.appendMarkdown("\n" + fn.doc.description + "\n");
  }

  const hasParamDocs = fn.params.some((p) => fn.doc.params.get(p.name.toLowerCase()));
  const rows = fn.params.map((p, i) => {
    const arg = argTexts[i];
    const value = arg !== undefined ? arg : p.optional ? `(default: ${p.defaultValue})` : "**missing!**";
    const desc = fn.doc.params.get(p.name.toLowerCase()) ?? "";
    return hasParamDocs
      ? `| \`${p.name}\` | \`${p.type}\` | ${value} | ${desc} |`
      : `| \`${p.name}\` | \`${p.type}\` | ${value} |`;
  });
  if (rows.length > 0) {
    const header = hasParamDocs
      ? "\n| Param | Type | Value | Description |\n|---|---|---|---|\n"
      : "\n| Param | Type | Value |\n|---|---|---|\n";
    md.appendMarkdown(header + rows.join("\n") + "\n");
  }

  if (argTexts.length > fn.params.length) {
    md.appendMarkdown(
      `\n⚠️ ${argTexts.length - fn.params.length} extra argument(s) passed beyond \`${fn.name}\`'s ${fn.params.length} parameter(s).\n`
    );
  }

  if (fn.returnType) {
    md.appendMarkdown(`\nReturns: \`${fn.returnType}\`${fn.doc.returns ? ` (${fn.doc.returns})` : ""}\n`);
  }

  const relPath = vscode.workspace.asRelativePath(fn.uri);
  md.appendMarkdown(`\n*Defined in ${relPath}*`);

  return new vscode.Hover(md, callRange);
}

function buildBuiltinCallHover(builtin: ReturnType<typeof findBuiltinFunction>): vscode.Hover {
  if (!builtin) return new vscode.Hover("");
  const signature = `${builtin.name}(${builtin.params
    .map((p) => `${p.name}: ${p.type}${p.optional ? ` = ${p.defaultValue}` : ""}`)
    .join(", ")}) :: ${builtin.returnType}`;

  const md = new vscode.MarkdownString();
  md.appendCodeblock(signature, "skript");
  md.appendMarkdown(`\n${builtin.description}\n`);
  md.appendMarkdown("\n*Built-in Skript function*");
  return new vscode.Hover(md);
}

function buildDefinitionHover(fn: FunctionInfo): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(fn.signatureLabel, "skript");
  md.appendMarkdown(renderDocMarkdown(fn.doc, fn.params).value);
  return new vscode.Hover(md, fn.nameRange);
}
