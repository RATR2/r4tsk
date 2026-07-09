import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { WorkspaceIndex } from "./parser/workspaceIndex";
import { SkriptHoverProvider } from "./providers/hoverProvider";
import { SkriptCompletionProvider } from "./providers/completionProvider";
import { DiagnosticsManager } from "./providers/diagnosticsProvider";
import { SkriptDefinitionProvider, SkriptReferenceProvider } from "./providers/definitionProvider";
import { SkriptSignatureHelpProvider } from "./providers/signatureHelpProvider";
import { SkriptDocumentSymbolProvider, SkriptWorkspaceSymbolProvider } from "./providers/symbolProviders";
import { ColorCodeDecorator } from "./providers/colorDecorations";
import { SkriptColorProvider } from "./providers/colorProvider";
import { AnnotationDecorator } from "./providers/annotationDecorations";
import { CustomPatternDecorator } from "./providers/customPatternDecorations";
import { DocsDatabase } from "./data/docsDatabase";
import { DocsHolder } from "./data/docsHolder";
import { DocsDownloadManager } from "./data/docsDownloadManager";
import { CrossVersionIndex } from "./data/crossVersionIndex";
import { SkriptVersionManager } from "./providers/skriptVersionManager";
import { registerManageAddonDocsCommand, registerSetDocsPathCommand } from "./providers/docsPathCommands";

const SKRIPT_SELECTOR: vscode.DocumentSelector = { language: "skript" };

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const index = new WorkspaceIndex();
  const colorDecorator = new ColorCodeDecorator();
  const annotationDecorator = new AnnotationDecorator();
  const customPatternDecorator = new CustomPatternDecorator();

  const config = () => vscode.workspace.getConfiguration("r4tsk");
  const bundledDocsPath = path.join(context.extensionPath, "data", "docs.json");

  const getCustomDocsPath = (): string | undefined => config().get<string>("docsPath")?.trim() || undefined;

  /** Absolute paths to addon docs.json files (e.g. generated via `/sk gen-docs` on a server with SkBee/Skript-GUI/etc. installed) to merge with whichever core Skript docs source is active. */
  const getAdditionalDocsPaths = (): string[] =>
    config()
      .get<string[]>("additionalDocsPaths", [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

  const readAdditionalDocsTexts = (): string[] => {
    const texts: string[] = [];
    for (const p of getAdditionalDocsPaths()) {
      try {
        texts.push(fs.readFileSync(p, "utf8"));
      } catch {
        // skip files that don't exist/can't be read - don't block the rest
      }
    }
    return texts;
  };

  /** (Re)establishes the docs database from current settings: a custom `docsPath` if set (falling back to bundled if it fails to load), else the bundled snapshot - always merged with `additionalDocsPaths`. */
  const establishDocsFromSettings = (): DocsDatabase | undefined => {
    const custom = getCustomDocsPath();
    const additional = getAdditionalDocsPaths();
    return custom
      ? (DocsDatabase.loadMultiple(custom, additional) ?? DocsDatabase.loadMultiple(bundledDocsPath, additional))
      : DocsDatabase.loadMultiple(bundledDocsPath, additional);
  };

  const bundledDocs = establishDocsFromSettings();
  const docsHolder = new DocsHolder(bundledDocs, bundledDocs?.sourceVersion);
  const downloadManager = new DocsDownloadManager(path.join(context.globalStorageUri.fsPath, "docs-cache"));
  const crossVersionIndex = new CrossVersionIndex(downloadManager);

  const versionManager = new SkriptVersionManager(context, () => docsHolder.activeVersionLabel);
  const diagnostics = new DiagnosticsManager(index, docsHolder, crossVersionIndex);

  const refreshAllOpenDocuments = () => {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === "skript") diagnostics.refresh(doc);
    }
  };

  const refreshDecorations = (editor: vscode.TextEditor | undefined) => {
    colorDecorator.refresh(editor);
    const excludedLines = editor ? customPatternDecorator.getMatchedLineSet(editor.document) : undefined;
    annotationDecorator.refresh(editor, excludedLines);
    customPatternDecorator.refresh(editor);
  };

  const applyVersion = async (version: string): Promise<void> => {
    const autoDownload = config().get<boolean>("autoDownloadDocs", true);
    if (!autoDownload || getCustomDocsPath()) return;

    versionManager.setResolving(true);
    try {
      const result = await downloadManager.getDatabaseForVersion(version, readAdditionalDocsTexts());
      if (result) {
        docsHolder.set(result.db, result.resolvedVersion);
        refreshAllOpenDocuments();
      }
    } finally {
      versionManager.setResolving(false);
    }
  };

  context.subscriptions.push(
    index,
    diagnostics,
    colorDecorator,
    annotationDecorator,
    customPatternDecorator,
    versionManager,
    versionManager.onVersionChanged((version) => void applyVersion(version)),
    vscode.commands.registerCommand("r4tsk.configureAnnotationColors", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "r4tsk.annotationColors")
    ),
    vscode.commands.registerCommand("r4tsk.configureCustomPatterns", () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "r4tsk.customPatterns")
    ),
    vscode.commands.registerCommand("r4tsk.setSkriptVersion", () => versionManager.promptForVersion()),
    registerSetDocsPathCommand(),
    registerManageAddonDocsCommand(),
    vscode.languages.registerHoverProvider(SKRIPT_SELECTOR, new SkriptHoverProvider(index, docsHolder, crossVersionIndex)),
    vscode.languages.registerCompletionItemProvider(SKRIPT_SELECTOR, new SkriptCompletionProvider(index), "{", "(", "%", " "),
    vscode.languages.registerDefinitionProvider(SKRIPT_SELECTOR, new SkriptDefinitionProvider(index)),
    vscode.languages.registerReferenceProvider(SKRIPT_SELECTOR, new SkriptReferenceProvider(index)),
    vscode.languages.registerSignatureHelpProvider(SKRIPT_SELECTOR, new SkriptSignatureHelpProvider(index), "(", ","),
    vscode.languages.registerDocumentSymbolProvider(SKRIPT_SELECTOR, new SkriptDocumentSymbolProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new SkriptWorkspaceSymbolProvider(index)),
    vscode.languages.registerColorProvider(SKRIPT_SELECTOR, new SkriptColorProvider())
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId !== "skript") return;
      index.indexDocument(doc);
      diagnostics.refresh(doc);
      void versionManager.ensurePrompted();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId !== "skript") return;
      index.indexDocument(e.document);
      diagnostics.refresh(e.document);
      if (vscode.window.activeTextEditor?.document === e.document) {
        refreshDecorations(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId !== "skript") return;
      diagnostics.clear(doc.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => refreshDecorations(editor)),
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const editor of editors) refreshDecorations(editor);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (annotationDecorator.isRelevantConfigChange(e)) annotationDecorator.rebuildTypes();
      if (customPatternDecorator.isRelevantConfigChange(e)) customPatternDecorator.rebuildTypes();
      if (annotationDecorator.isRelevantConfigChange(e) || customPatternDecorator.isRelevantConfigChange(e)) {
        for (const editor of vscode.window.visibleTextEditors) refreshDecorations(editor);
      }
      if (e.affectsConfiguration("r4tsk.additionalDocsPaths") || e.affectsConfiguration("r4tsk.docsPath")) {
        const storedVersion = versionManager.getVersion();
        if (storedVersion && !getCustomDocsPath()) {
          void applyVersion(storedVersion);
        } else {
          const reloaded = establishDocsFromSettings();
          if (reloaded) {
            docsHolder.set(reloaded, reloaded.sourceVersion);
            refreshAllOpenDocuments();
          }
        }
      }
    }),
    index.onDidChange(() => refreshAllOpenDocuments())
  );

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.sk");
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(async (uri) => index.indexDocument(await vscode.workspace.openTextDocument(uri))),
    watcher.onDidChange(async (uri) => index.indexDocument(await vscode.workspace.openTextDocument(uri))),
    watcher.onDidDelete((uri) => index.removeDocument(uri))
  );

  await index.initialize();
  let sawSkriptDoc = false;
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "skript") {
      diagnostics.refresh(doc);
      sawSkriptDoc = true;
    }
  }
  for (const editor of vscode.window.visibleTextEditors) refreshDecorations(editor);
  if (sawSkriptDoc) {
    void versionManager.ensurePrompted();
    const storedVersion = versionManager.getVersion();
    if (storedVersion) void applyVersion(storedVersion);
  }

  if (config().get<boolean>("crossVersionSuggestions", true) && !getCustomDocsPath()) {
    void crossVersionIndex.warmUp().then(refreshAllOpenDocuments);
  }
}

export function deactivate(): void {
  // Nothing to clean up beyond what's registered in context.subscriptions.
}
