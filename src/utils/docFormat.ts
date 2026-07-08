import * as vscode from "vscode";
import { FunctionDoc, ParamInfo } from "../parser/types";

/** Renders a full doc comment (description + all tags) as one markdown block. */
export function renderDocMarkdown(doc: FunctionDoc, params: ParamInfo[]): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;

  if (doc.deprecated) {
    md.appendMarkdown(`**⚠️ Deprecated:** ${doc.deprecated}\n\n`);
  }

  if (doc.description) {
    md.appendMarkdown(doc.description + "\n\n");
  }

  const paramEntries = params
    .map((p) => ({ name: p.name, desc: doc.params.get(p.name.toLowerCase()) }))
    .filter((e): e is { name: string; desc: string } => !!e.desc);
  if (paramEntries.length > 0) {
    md.appendMarkdown("**Parameters:**\n\n");
    for (const { name, desc } of paramEntries) {
      md.appendMarkdown(`- \`${name}\`: ${desc}\n`);
    }
    md.appendMarkdown("\n");
  }

  if (doc.returns) {
    md.appendMarkdown(`**Returns:** ${doc.returns}\n`);
  }

  return md;
}
