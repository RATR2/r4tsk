import * as vscode from "vscode";
import { findCommentStart } from "../utils/textScanning";
import { ANNOTATION_DEFAULTS, AnnotationKey, scanAnnotations } from "../utils/annotationTags";

const CONFIG_SECTION = "r4tsk.annotationColors";
const KEYS = Object.keys(ANNOTATION_DEFAULTS) as AnnotationKey[];

/**
 * Colors doc/annotation tags (@param, @return, @deprecated, TODO, WARN,
 * !/important) using live editor decorations instead of static theme
 * colors, so foreground *and* background are user-configurable via
 * `r4tsk.annotationColors.*` settings and apply under any color theme.
 */
export class AnnotationDecorator {
  private readonly decorationTypes = new Map<AnnotationKey, vscode.TextEditorDecorationType>();

  constructor() {
    this.rebuildTypes();
  }

  isRelevantConfigChange(e: vscode.ConfigurationChangeEvent): boolean {
    return e.affectsConfiguration(CONFIG_SECTION);
  }

  rebuildTypes(): void {
    for (const type of this.decorationTypes.values()) type.dispose();
    this.decorationTypes.clear();

    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    for (const key of KEYS) {
      const foreground = cfg.get<string>(`${key}.foreground`)?.trim() || ANNOTATION_DEFAULTS[key];
      const background = cfg.get<string>(`${key}.background`)?.trim() || undefined;
      this.decorationTypes.set(
        key,
        vscode.window.createTextEditorDecorationType({
          color: foreground,
          backgroundColor: background,
          fontWeight: "bold",
          fontStyle: key === "deprecated" ? "italic" : undefined,
        })
      );
    }
  }

  refresh(editor: vscode.TextEditor | undefined, excludedLines?: Set<number>): void {
    if (!editor || editor.document.languageId !== "skript") return;

    const document = editor.document;
    const rangesByKey = new Map<AnnotationKey, vscode.Range[]>(KEYS.map((k) => [k, []]));

    for (let line = 0; line < document.lineCount; line++) {
      if (excludedLines?.has(line)) continue;
      const text = document.lineAt(line).text;
      const commentStart = findCommentStart(text);
      if (commentStart === -1) continue;

      const commentText = text.slice(commentStart);
      for (const m of scanAnnotations(commentText)) {
        rangesByKey
          .get(m.key)!
          .push(new vscode.Range(line, commentStart + m.start, line, commentStart + m.end));
      }
    }

    for (const [key, type] of this.decorationTypes) {
      editor.setDecorations(type, rangesByKey.get(key) ?? []);
    }
  }

  dispose(): void {
    for (const type of this.decorationTypes.values()) type.dispose();
    this.decorationTypes.clear();
  }
}
