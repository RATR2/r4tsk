import * as path from "path";
import * as vscode from "vscode";

function updateTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

async function pickJsonFile(title: string): Promise<string | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Select",
    filters: { "JSON files": ["json"] },
    title,
  });
  return uris?.[0]?.fsPath;
}

/** "r4tsk: Set Core Docs File..." - browse for a docs.json to override the bundled/auto-downloaded core Skript docs, or clear it to go back to auto-download. */
export function registerSetDocsPathCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("r4tsk.setDocsPath", async () => {
    const cfg = vscode.workspace.getConfiguration("r4tsk");
    const current = cfg.get<string>("docsPath")?.trim();

    const BROWSE = "$(folder-opened) Browse for a docs.json file...";
    const CLEAR = "$(clear-all) Clear (use auto-download / bundled docs instead)";
    const choice = await vscode.window.showQuickPick(current ? [BROWSE, CLEAR] : [BROWSE], {
      title: current ? `r4tsk: Core Docs File (currently: ${path.basename(current)})` : "r4tsk: Core Docs File",
      placeHolder: current ?? "Not set - using auto-download or the bundled snapshot",
    });
    if (!choice) return;

    if (choice === CLEAR) {
      await cfg.update("docsPath", "", updateTarget());
      vscode.window.showInformationMessage("r4tsk: cleared the custom docs file - back to auto-download.");
      return;
    }

    const selected = await pickJsonFile("Select a docs.json file (core Skript docs, from https://github.com/SkriptLang/skript-docs)");
    if (!selected) return;

    await cfg.update("docsPath", selected, updateTarget());
    vscode.window.showInformationMessage(`r4tsk: now using ${path.basename(selected)} as the core docs file.`);
  });
}

/** "r4tsk: Manage Addon Docs Files..." - add/remove docs.json files (SkBee, Skript-GUI, etc.) merged with the core Skript docs. */
export function registerManageAddonDocsCommand(): vscode.Disposable {
  return vscode.commands.registerCommand("r4tsk.manageAddonDocsFiles", async () => {
    const cfg = vscode.workspace.getConfiguration("r4tsk");
    const current = cfg.get<string[]>("additionalDocsPaths", []);

    const ADD_LABEL = "$(add) Add a docs.json file...";
    const qp = vscode.window.createQuickPick();
    qp.title = "r4tsk: Addon Docs Files";
    qp.placeholder =
      current.length === 0
        ? "No addon docs files yet - select 'Add' to browse for one (e.g. generated via /sk gen-docs)"
        : "Select 'Add' to browse for another file, or click the trash icon to remove one.";
    qp.items = [
      { label: ADD_LABEL, alwaysShow: true },
      ...current.map((p) => ({
        label: `$(file) ${path.basename(p)}`,
        description: p,
        buttons: [{ iconPath: new vscode.ThemeIcon("trash"), tooltip: "Remove" }],
      })),
    ];

    qp.onDidTriggerItemButton(async (e) => {
      const removePath = e.item.description;
      if (!removePath) return;
      const updated = current.filter((p) => p !== removePath);
      await cfg.update("additionalDocsPaths", updated, updateTarget());
      vscode.window.showInformationMessage(`r4tsk: removed ${path.basename(removePath)} from addon docs.`);
      qp.hide();
    });

    qp.onDidAccept(async () => {
      const selected = qp.selectedItems[0];
      qp.hide();
      if (selected?.label !== ADD_LABEL) return;

      const picked = await pickJsonFile("Select an addon docs.json file (e.g. generated via /sk gen-docs on a server with the addon installed)");
      if (!picked) return;

      if (current.includes(picked)) {
        vscode.window.showInformationMessage("r4tsk: that file is already in your addon docs list.");
        return;
      }

      await cfg.update("additionalDocsPaths", [...current, picked], updateTarget());
      vscode.window.showInformationMessage(`r4tsk: added ${path.basename(picked)} to addon docs.`);
    });

    qp.show();
  });
}
