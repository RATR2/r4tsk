import * as vscode from "vscode";

export interface ParamInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
  range: vscode.Range;
}

/**
 * A JavaDoc-style doc comment parsed out of the `#` lines directly above a
 * function definition. Recognizes `@param <name> <description>`,
 * `@return[s] <description>` and `@deprecated [reason]` tags; everything
 * before the first tag is the free-form description.
 */
export interface FunctionDoc {
  description: string;
  /** Param name (lowercased) -> description. */
  params: Map<string, string>;
  returns?: string;
  deprecated?: string;
  /** The comment exactly as written, tags included. */
  raw: string;
}

export interface FunctionInfo {
  name: string;
  params: ParamInfo[];
  returnType?: string;
  doc: FunctionDoc;
  uri: vscode.Uri;
  nameRange: vscode.Range;
  headerRange: vscode.Range;
  signatureLabel: string;
}

export interface CommandInfo {
  name: string;
  usage?: string;
  permission?: string;
  description?: string;
  uri: vscode.Uri;
  nameRange: vscode.Range;
}

export interface EventInfo {
  name: string;
  uri: vscode.Uri;
  nameRange: vscode.Range;
}

export interface ArgToken {
  text: string;
  range: vscode.Range;
}

export interface FunctionCallSite {
  name: string;
  nameRange: vscode.Range;
  callRange: vscode.Range;
  args: ArgToken[];
}

export interface ParsedDocument {
  uri: vscode.Uri;
  version: number;
  functions: FunctionInfo[];
  commands: CommandInfo[];
  events: EventInfo[];
  calls: FunctionCallSite[];
}
