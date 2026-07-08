import * as vscode from "vscode";

const STORAGE_KEY = "r4tsk.skriptVersion";

/**
 * Tracks which Skript version the user says they're running, prompting once
 * (the first time a .sk file is opened) and offering a status bar item to
 * change it later. Compares against whichever docs database is currently
 * active (see `DocsHolder`) and flags a mismatch, since syntax/hover info is
 * generated for one specific Skript version.
 */
export class SkriptVersionManager {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly onVersionChangedEmitter = new vscode.EventEmitter<string>();
  readonly onVersionChanged = this.onVersionChangedEmitter.event;
  private hasPromptedThisSession = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    /** Returns the version label to compare against (the currently *active* docs database, which may have been downloaded to match the user's version - not always the bundled default). */
    private readonly getComparisonVersion: () => string | undefined
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = "r4tsk.setSkriptVersion";
    this.updateStatusBar();
    this.statusBarItem.show();
  }

  getVersion(): string | undefined {
    return this.context.globalState.get<string>(STORAGE_KEY);
  }

  /** Prompts once per session, and only if no version has ever been recorded. */
  async ensurePrompted(): Promise<void> {
    if (this.hasPromptedThisSession || this.getVersion()) return;
    this.hasPromptedThisSession = true;
    await this.promptForVersion();
  }

  async promptForVersion(): Promise<void> {
    const current = this.getVersion();
    const comparisonVersion = this.getComparisonVersion();
    const input = await vscode.window.showInputBox({
      title: "What version of Skript are you running?",
      prompt: comparisonVersion
        ? `Used to fetch/compare against a matching docs database (currently: Skript ${comparisonVersion}).`
        : "Used to fetch/compare against a matching docs database.",
      placeHolder: comparisonVersion ?? "e.g. 2.9.4",
      value: current,
      ignoreFocusOut: true,
    });

    if (input === undefined) return;
    const trimmed = input.trim();
    if (trimmed.length === 0) return;

    await this.context.globalState.update(STORAGE_KEY, trimmed);
    this.updateStatusBar();
    this.onVersionChangedEmitter.fire(trimmed);
  }

  /** Shows a transient "resolving..." state while a matching docs database downloads. */
  setResolving(resolving: boolean): void {
    if (resolving) {
      this.statusBarItem.text = "$(sync~spin) Skript: fetching docs...";
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.updateStatusBar();
    }
  }

  updateStatusBar(): void {
    const version = this.getVersion();
    if (!version) {
      this.statusBarItem.text = "$(question) Skript: not set";
      this.statusBarItem.tooltip = "Click to tell r4tsk what version of Skript you're running.";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const comparisonVersion = this.getComparisonVersion();
    const mismatch = comparisonVersion !== undefined && !versionsRoughlyMatch(version, comparisonVersion);
    this.statusBarItem.text = `${mismatch ? "$(warning)" : "$(check)"} Skript: ${version}`;
    this.statusBarItem.backgroundColor = mismatch
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    this.statusBarItem.tooltip = mismatch
      ? `The active docs database is for Skript ${comparisonVersion}, but you're on ${version}. Hover/completion info may not perfectly match your version. Click to change.`
      : `Docs database matches your Skript version${comparisonVersion ? ` (${comparisonVersion})` : ""}. Click to change.`;
  }

  dispose(): void {
    this.statusBarItem.dispose();
    this.onVersionChangedEmitter.dispose();
  }
}

function versionsRoughlyMatch(a: string, b: string): boolean {
  const majorMinor = (v: string) => v.match(/^\d+\.\d+/)?.[0];
  return majorMinor(a) === majorMinor(b);
}
