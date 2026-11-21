import * as vscode from "vscode";

/**
 * Other VS Code extensions that also register the `skript` language for `.sk`
 * files. Running one next to r4tsk gives duplicate completions, hovers and
 * diagnostics, so r4tsk tells the user once instead of silently doubling up.
 */
export const CONFLICTING_EXTENSIONS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "xena-studios.neoskript", name: "NeoSkript" },
  { id: "johnheikens.intelliskript", name: "IntelliSkript" },
];

const DISMISSED_KEY = "r4tsk.conflictCheck.dismissed";

/** Installed conflicting extensions, by display name. */
export function findInstalledConflicts(): Array<{ id: string; name: string }> {
  return CONFLICTING_EXTENSIONS.filter((c) => vscode.extensions.getExtension(c.id) !== undefined);
}

/**
 * Warns once per set of conflicting extensions. "Don't warn again" is
 * remembered per set, so installing a different competitor warns again, and
 * `r4tsk.conflictCheck` turns the whole check off.
 */
export async function checkForConflicts(context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.getConfiguration("r4tsk").get<boolean>("conflictCheck", true)) return;
  const conflicts = findInstalledConflicts();
  if (conflicts.length === 0) return;

  const signature = conflicts.map((c) => c.id).sort().join(",");
  const dismissed = context.globalState.get<string[]>(DISMISSED_KEY, []);
  if (dismissed.includes(signature)) return;

  const names = conflicts.map((c) => c.name).join(" and ");
  const showButton = "Show in Extensions";
  const dismissButton = "Don't warn again";
  const choice = await vscode.window.showWarningMessage(
    `r4tsk and ${names} both handle .sk files, so you may see duplicate completions, hovers and diagnostics. Disable one of them for the best results.`,
    showButton,
    dismissButton
  );
  if (choice === showButton) {
    await vscode.commands.executeCommand("workbench.extensions.search", `@installed ${conflicts[0].id}`);
  } else if (choice === dismissButton) {
    await context.globalState.update(DISMISSED_KEY, [...dismissed, signature]);
  }
}
