import * as vscode from "vscode";
import { SkriptHubAddon } from "../data/skriptHubClient";
import { AddonDocsManager } from "../data/addonDocsManager";

function updateTarget(): vscode.ConfigurationTarget {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

interface AddonItem extends vscode.QuickPickItem {
  addonName: string;
}

/** "r4tsk: Add Addon Docs from SkriptHub..." - multi-select addons whose syntax is merged into the docs; stored in `r4tsk.addons` (applied live by the config listener in extension.ts). */
export function registerAddAddonDocsCommand(manager: AddonDocsManager): vscode.Disposable {
  return vscode.commands.registerCommand("r4tsk.addAddonDocsFromSkriptHub", async () => {
    const cfg = vscode.workspace.getConfiguration("r4tsk");
    const current = cfg.get<string[]>("addons", []);

    const loaded = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "r4tsk: loading the addon list from SkriptHub..." },
      async () => {
        try {
          const [syntax, addons] = await Promise.all([manager.client.getSyntax(), manager.client.listAddons()]);
          return { syntax, addons };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      }
    );
    if ("error" in loaded) {
      vscode.window.showErrorMessage(`r4tsk: could not reach SkriptHub and no cached list exists (${loaded.error}).`);
      return;
    }

    const stats = new Map<string, { total: number; functions: number; usage: number }>();
    for (const e of loaded.syntax.entries) {
      const name = e.addon.name;
      if (name.toLowerCase() === "skript" || e.mark_as_removed) continue;
      const s = stats.get(name) ?? { total: 0, functions: 0, usage: e.addon.usage_score ?? 0 };
      s.total++;
      if (e.syntax_type === "function") s.functions++;
      stats.set(name, s);
    }
    const authors = new Map<string, SkriptHubAddon>(loaded.addons.map((a) => [a.name, a]));

    const selected = new Set(current.map((n) => n.toLowerCase()));
    const items: AddonItem[] = [...stats.entries()]
      .sort((a, b) => b[1].usage - a[1].usage || a[0].localeCompare(b[0]))
      .map(([name, s]) => ({
        label: name,
        addonName: name,
        description: `${s.total} syntax entries${s.functions ? `, ${s.functions} functions` : ""}`,
        detail: authors.get(name)?.author ? `by ${authors.get(name)!.author}` : undefined,
      }));
    for (const name of current) {
      if (!stats.has(name)) items.unshift({ label: name, addonName: name, description: "not listed on SkriptHub" });
    }

    const qp = vscode.window.createQuickPick<AddonItem>();
    qp.title = "r4tsk: Addon Docs from SkriptHub";
    qp.placeholder = loaded.syntax.stale
      ? "Offline - using an older cached list. Tick the addons you use."
      : "Tick the addons you use (SkBee, Skript-Particle, ...). Untick to remove.";
    qp.canSelectMany = true;
    qp.matchOnDetail = true;
    qp.items = items;
    qp.selectedItems = items.filter((i) => selected.has(i.addonName.toLowerCase()));

    qp.onDidAccept(async () => {
      const chosen = qp.selectedItems.map((i) => i.addonName);
      qp.hide();
      await cfg.update("addons", chosen, updateTarget());
      vscode.window.showInformationMessage(
        chosen.length === 0
          ? "r4tsk: removed all SkriptHub addon docs."
          : `r4tsk: using SkriptHub docs for ${chosen.length} addon${chosen.length === 1 ? "" : "s"}: ${chosen.join(", ")}.`
      );
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  });
}
