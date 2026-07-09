import * as vscode from "vscode";
import { maskLine, splitTopLevel, findMatchingClose } from "../utils/textScanning";
import {
  ArgToken,
  CommandInfo,
  EventInfo,
  FunctionCallSite,
  FunctionDoc,
  FunctionInfo,
  ParamInfo,
  ParsedDocument,
} from "./types";

const FUNCTION_HEADER = /^(\s*)function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
/** `local function` - same shape as a regular function, but only callable from within its own script (see FunctionInfo.isLocal). Kept as its own pattern rather than folding an optional "local" into FUNCTION_HEADER above. */
const LOCAL_FUNCTION_HEADER = /^(\s*)local\s+function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
const COMMAND_HEADER = /^(\s*)command\s+(\/[a-zA-Z0-9_]+)/;
const EVENT_HEADER = /^(\s*)on\s+([^:]+?)\s*:\s*$/;
const COMMAND_SUBKEY = /^(\s*)(permission|description|usage|aliases|permission message|cooldown message):\s*(.*)$/i;
const PARAM_PATTERN = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][\w ]*?)(?:\s*=\s*(.*))?$/;
const RETURN_TYPE = /^\)\s*(?:::\s*([a-zA-Z_][\w ]*?))?\s*:\s*$/;
const CALL_SITE = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g;

export function parseDocument(document: vscode.TextDocument): ParsedDocument {
  const lineCount = document.lineCount;
  const rawLines: string[] = [];
  const maskedLines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const text = document.lineAt(i).text;
    rawLines.push(text);
    maskedLines.push(maskLine(text));
  }

  const functions: FunctionInfo[] = [];
  const commands: CommandInfo[] = [];
  const events: EventInfo[] = [];
  const calls: FunctionCallSite[] = [];
  const definitionLines = new Set<number>();

  for (let lineNo = 0; lineNo < lineCount; lineNo++) {
    const masked = maskedLines[lineNo];

    const localFnMatch = LOCAL_FUNCTION_HEADER.exec(masked);
    const fnMatch = localFnMatch ?? FUNCTION_HEADER.exec(masked);
    if (fnMatch) {
      const info = parseFunctionHeader(document, lineNo, rawLines, maskedLines, fnMatch, localFnMatch !== null);
      if (info) {
        functions.push(info);
        definitionLines.add(lineNo);
        continue;
      }
    }

    const cmdMatch = COMMAND_HEADER.exec(masked);
    if (cmdMatch) {
      commands.push(parseCommandHeader(document, lineNo, rawLines, maskedLines, cmdMatch));
      definitionLines.add(lineNo);
      continue;
    }

    const evMatch = EVENT_HEADER.exec(masked);
    if (evMatch) {
      const nameStart = evMatch[0].indexOf(evMatch[2], evMatch[1].length);
      events.push({
        name: evMatch[2].trim(),
        uri: document.uri,
        nameRange: new vscode.Range(lineNo, nameStart, lineNo, nameStart + evMatch[2].length),
      });
      definitionLines.add(lineNo);
      continue;
    }
  }

  for (let lineNo = 0; lineNo < lineCount; lineNo++) {
    if (definitionLines.has(lineNo)) continue;
    const masked = maskedLines[lineNo];
    const raw = rawLines[lineNo];

    CALL_SITE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL_SITE.exec(masked))) {
      const name = match[1];
      const nameStart = match.index;
      const openIdx = nameStart + match[0].length;
      if (masked[openIdx] !== "(") continue;

      const closeIdx = findMatchingClose(masked, openIdx);
      if (closeIdx === -1) continue;

      const argsText = raw.slice(openIdx + 1, closeIdx);
      const tokens = splitTopLevel(argsText).filter((t) => t.text.length > 0);
      const args: ArgToken[] = tokens.map((t) => ({
        text: t.text,
        range: new vscode.Range(lineNo, openIdx + 1 + t.start, lineNo, openIdx + 1 + t.end),
      }));

      calls.push({
        name,
        nameRange: new vscode.Range(lineNo, nameStart, lineNo, nameStart + name.length),
        callRange: new vscode.Range(lineNo, nameStart, lineNo, closeIdx + 1),
        args,
      });
    }
  }

  return {
    uri: document.uri,
    version: document.version,
    functions,
    commands,
    events,
    calls,
  };
}

function parseFunctionHeader(
  document: vscode.TextDocument,
  lineNo: number,
  rawLines: string[],
  maskedLines: string[],
  fnMatch: RegExpExecArray,
  isLocal: boolean
): FunctionInfo | undefined {
  const masked = maskedLines[lineNo];
  const raw = rawLines[lineNo];
  const name = fnMatch[2];
  const nameStart = fnMatch[0].indexOf(name, fnMatch[1].length);
  const openIdx = fnMatch[0].length - 1;
  const closeIdx = findMatchingClose(masked, openIdx);
  if (closeIdx === -1) return undefined;

  const paramsText = raw.slice(openIdx + 1, closeIdx);
  const paramTokens = splitTopLevel(paramsText).filter((t) => t.text.length > 0);
  const params: ParamInfo[] = [];
  for (const tok of paramTokens) {
    const pm = PARAM_PATTERN.exec(tok.text);
    if (!pm) continue;
    params.push({
      name: pm[1],
      type: pm[2].trim(),
      optional: pm[3] !== undefined,
      defaultValue: pm[3]?.trim(),
      range: new vscode.Range(
        lineNo,
        openIdx + 1 + tok.start,
        lineNo,
        openIdx + 1 + tok.end
      ),
    });
  }

  const remainder = masked.slice(closeIdx);
  const retMatch = RETURN_TYPE.exec(remainder);
  const returnType = retMatch?.[1]?.trim();
  if (!retMatch) return undefined;

  const doc = parseFunctionDoc(rawLines, lineNo);
  const signatureLabel = buildSignatureLabel(name, params, returnType);

  return {
    name,
    params,
    returnType,
    doc,
    uri: document.uri,
    nameRange: new vscode.Range(lineNo, nameStart, lineNo, nameStart + name.length),
    headerRange: new vscode.Range(lineNo, 0, lineNo, raw.length),
    signatureLabel,
    isLocal,
  };
}

function parseCommandHeader(
  document: vscode.TextDocument,
  lineNo: number,
  rawLines: string[],
  maskedLines: string[],
  cmdMatch: RegExpExecArray
): CommandInfo {
  const name = cmdMatch[2];
  const nameStart = cmdMatch[0].indexOf(name, cmdMatch[1].length);
  const baseIndent = cmdMatch[1].length;

  const info: CommandInfo = {
    name,
    uri: document.uri,
    nameRange: new vscode.Range(lineNo, nameStart, lineNo, nameStart + name.length),
  };

  for (let i = lineNo + 1; i < rawLines.length; i++) {
    const line = maskedLines[i];
    if (line.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) break;

    const subMatch = COMMAND_SUBKEY.exec(line);
    if (subMatch) {
      const key = subMatch[2].toLowerCase();
      const value = rawLines[i].slice(subMatch[0].length - subMatch[3].length).trim();
      if (key === "permission") info.permission = value;
      else if (key === "description") info.description = value;
      else if (key === "usage") info.usage = value;
    }
  }

  return info;
}

const PARAM_TAG = /^@param\s+(\S+)\s*(.*)$/i;
const RETURN_TAG = /^@returns?\s*(.*)$/i;
const DEPRECATED_TAG = /^@deprecated\s*(.*)$/i;

/**
 * Parses the `#` comment lines directly above a function definition as a
 * JavaDoc-style doc comment: everything before the first `@tag` is the
 * description, then `@param <name> <description>`, `@return[s] <description>`
 * and `@deprecated [reason]` tags. A tag's description can continue onto
 * following comment lines until the next tag.
 */
function parseFunctionDoc(rawLines: string[], defLineNo: number): FunctionDoc {
  const commentLines: string[] = [];
  for (let i = defLineNo - 1; i >= 0; i--) {
    const trimmed = rawLines[i].trim();
    if (trimmed.startsWith("#")) {
      commentLines.unshift(trimmed.replace(/^#\s?/, ""));
    } else {
      break;
    }
  }

  const description: string[] = [];
  const params = new Map<string, string>();
  let returns: string | undefined;
  let deprecated: string | undefined;
  let target: "description" | "returns" | "deprecated" | string = "description";

  for (const line of commentLines) {
    const paramMatch = PARAM_TAG.exec(line);
    if (paramMatch) {
      const paramName = paramMatch[1].replace(/^[{<]|[}>]$/g, "").toLowerCase();
      params.set(paramName, paramMatch[2]);
      target = paramName;
      continue;
    }

    const returnMatch = RETURN_TAG.exec(line);
    if (returnMatch) {
      returns = returnMatch[1];
      target = "returns";
      continue;
    }

    const deprecatedMatch = DEPRECATED_TAG.exec(line);
    if (deprecatedMatch) {
      deprecated = deprecatedMatch[1] || "This function is deprecated.";
      target = "deprecated";
      continue;
    }

    if (line.trim().length === 0) continue;

    if (target === "description") description.push(line);
    else if (target === "returns") returns = `${returns ?? ""} ${line}`.trim();
    else if (target === "deprecated") deprecated = `${deprecated ?? ""} ${line}`.trim();
    else params.set(target, `${params.get(target) ?? ""} ${line}`.trim());
  }

  return {
    description: description.join("\n").trim(),
    params,
    returns,
    deprecated,
    raw: commentLines.join("\n"),
  };
}

function buildSignatureLabel(name: string, params: ParamInfo[], returnType: string | undefined): string {
  const paramList = params
    .map((p) => `${p.name}: ${p.type}${p.optional ? ` = ${p.defaultValue}` : ""}`)
    .join(", ");
  const ret = returnType ? ` :: ${returnType}` : "";
  return `${name}(${paramList})${ret}`;
}
