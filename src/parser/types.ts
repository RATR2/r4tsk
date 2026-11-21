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
  /** Declared with `local function` - only callable from within its own script, and doesn't collide with same-named functions (local or global) in other files. */
  isLocal: boolean;
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

/** An entry of the script's top-level `options:` block, referenced as `{@name}`. Options are file-scoped. */
export interface OptionInfo {
  name: string;
  value: string;
  uri: vscode.Uri;
  nameRange: vscode.Range;
}

/** A `{@name}` reference to an option. */
export interface OptionUsage {
  name: string;
  /** Just the name inside the braces. */
  nameRange: vscode.Range;
  /** The whole `{@name}`. */
  range: vscode.Range;
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

/** A top-level `using <feature>` line that opts the script into an experimental language feature. */
export interface UsingLine {
  feature: string;
  featureRange: vscode.Range;
  lineRange: vscode.Range;
}

export interface ParsedDocument {
  uri: vscode.Uri;
  version: number;
  functions: FunctionInfo[];
  commands: CommandInfo[];
  events: EventInfo[];
  calls: FunctionCallSite[];
  options: OptionInfo[];
  optionUsages: OptionUsage[];
  usings: UsingLine[];
}
