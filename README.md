<div align="center">

<img src="https://raw.githubusercontent.com/RATR2/r4tsk/main/icon.png" alt="r4tsk icon" width="128" height="128">

# r4tsk

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/r4tsk.r4tsk?style=for-the-badge&logo=visualstudiocode&label=marketplace)](https://marketplace.visualstudio.com/items?itemName=r4tsk.r4tsk)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/r4tsk.r4tsk?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=r4tsk.r4tsk)
[![Open VSX](https://img.shields.io/open-vsx/v/r4tsk/r4tsk?style=for-the-badge&label=open%20vsx)](https://open-vsx.org/extension/r4tsk/r4tsk)
[![Issues](https://img.shields.io/github/issues/RATR2/r4tsk?style=for-the-badge&logo=github)](https://github.com/RATR2/r4tsk/issues)
[![License](https://img.shields.io/github/license/RATR2/r4tsk?style=for-the-badge&logo=github)](LICENSE)
[![Editors](https://img.shields.io/badge/editors-vs%20code%20%7C%20vscodium-blue?style=for-the-badge)](#install)
[![Status](https://img.shields.io/badge/status-in--development-yellow?style=for-the-badge)](#status)

> Skript language support that checks your scripts against Skript's real syntax, not a guess.

If you find any issues, please report them [here](https://github.com/RATR2/r4tsk/issues)

</div>

---

## What is this

r4tsk adds Skript (`.sk`) support to VS Code and VSCodium. It reads your scripts, matches every line against the real Skript docs for your version, and tells you what a line is, what it needs, and when Skript will probably not understand it. Functions, doc comments, options, chat colors and addons are understood too.

**Understands your scripts**
- **Diagnostics.** Undefined functions, wrong argument counts, duplicate functions, stale doc tags, deprecated syntax, and lines Skript may not understand.
- **Hover, signature help and autocomplete** for your own functions, events, effects, conditions, types and variables.
- **Go to definition and find references** for functions and `{@options}`, plus an outline and workspace symbol search.
- **Doc comments.** Write `@param`, `@return` and `@deprecated` above a function and they show up in hover, completion and signature help. Tags that do not match the signature are flagged.
- **`local function`** is scoped correctly: calls, completion and duplicate checks all respect it.
- **Options.** `{@name}` jumps to its entry in the `options:` block, shows its value on hover, completes after `{@`, and warns when the name does not exist in that script.
- **Experimental features.** Using syntax that needs an experiment without its `using <feature>` line warns that you are missing the feature. Hover and completion work on `using` lines.

**Knows Skript's real syntax**
- **Docs from the Skript wiki's own data.** A bundled snapshot of [skript-docs](https://github.com/SkriptLang/skript-docs) (1200+ events, effects, conditions, expressions, types, functions and structures) is matched with a real pattern engine, not keyword guessing.
- **Matches your Skript version.** Tell r4tsk which version you run and it downloads the closest docs, cached in the background. Use `r4tsk.docsPath` for a file you generated yourself with `/sk gen-docs`.
- **"You might be thinking of X from Skript Y."** If a name does not exist in your version but does in a nearby one, hover and the undefined-function warning say so.
- **Unrecognized lines.** A statement that matches no effect, condition or section is reported as "Skript may not understand this line". It is conservative on purpose and skips anything it cannot judge.

**Addons**
- **SkriptHub picker.** Run "r4tsk: Add Addon Docs from SkriptHub..." and tick the addons you use (SkBee, Skript-Particle, skript-math, skript-reflect and more). Their syntax is merged live, no reload.
- **Anything else.** Addons SkriptHub does not list, such as Skript-GUI, work through a `docs.json` from `/sk gen-docs` added with "r4tsk: Manage Addon Docs Files...".
- **Server plugins folder.** If your workspace is inside a Skript server (a `plugins` folder next to `plugins/Skript`), r4tsk offers once to use the addons it finds there: jars that match SkriptHub addons, and the `docs.json` from `/sk gen-docs` if you copied it to `plugins/Skript/docs/`. Turn it off with `r4tsk.detectServerAddons`.
- **Addon functions** like `dustOption` are known, so they are not reported as undefined. Add your own names to `r4tsk.knownFunctions`.

**Looks good**
- **Chat colors, live.** `&c`, `&l`, `<#rrggbb>` and `<##rrggbb>` inside strings are drawn in their real in-game color and style, with a color picker for hex tags.
- **Colored annotations.** `@param`, `@return`, `@deprecated`, `TODO`, `WARN` and `!` in comments, with colors you can change.
- **Custom colored patterns.** Color any regex you define, anywhere in a script.
- **R4TSK Dark**, a theme with hand-picked Skript colors.

## Install

Search for **r4tsk** in the Extensions view, or install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=r4tsk.r4tsk) or [Open VSX](https://open-vsx.org/extension/r4tsk/r4tsk). VSCodium reads Open VSX. Needs VS Code 1.85 or newer.

1. Open any `.sk` file. r4tsk asks which Skript version you run, and remembers it. The status bar shows it and you can click it to change it.
2. Optional: run "r4tsk: Add Addon Docs from SkriptHub..." and pick your addons.
3. Optional: open [`examples/example.sk`](examples/example.sk) to see every feature in one script.

If NeoSkript or IntelliSkript is installed next to r4tsk you will get duplicate completions and diagnostics, so r4tsk warns once. Turn that off with `r4tsk.conflictCheck`.

## Settings and commands

| Setting | What it does |
|---|---|
| `r4tsk.diagnostics.enable` | Turns all diagnostics on or off |
| `r4tsk.diagnostics.unrecognizedSyntax` | `off`, `information` or `warning` for lines Skript may not understand |
| `r4tsk.diagnostics.experimentalNotice` | The missing `using <feature>` warning |
| `r4tsk.docsPath` | Use your own core `docs.json` instead of the auto-downloaded one |
| `r4tsk.autoDownloadDocs` | Download docs matching your Skript version |
| `r4tsk.addons` | Addons picked from SkriptHub |
| `r4tsk.additionalDocsPaths` | Extra `docs.json` files, for addons SkriptHub does not list |
| `r4tsk.detectServerAddons` | Offer addons found in the server's plugins folder |
| `r4tsk.knownFunctions` | Function names to treat as defined |
| `r4tsk.crossVersionSuggestions` | The "you might be thinking of" hints |
| `r4tsk.conflictCheck` | The warning about other Skript extensions |
| `r4tsk.annotationColors.*` | Foreground and background per annotation tag |
| `r4tsk.customPatterns` | Regex patterns to color, `{ pattern, color, background?, flags?, bold?, italic? }` |

Commands, from the Command Palette: Check Script (also the play button in the editor title bar of any `.sk` file, it runs the checks now and reports the counts), Set Skript Version, Set Core Docs File, Add Addon Docs from SkriptHub, Manage Addon Docs Files, Configure Annotation Colors, Configure Custom Colored Patterns.

## Status

In development. It works on real scripts, but it is regex-based and is not a full parser with type inference.

- A few patterns with two wildcards back to back can resolve to a plausible but not exact entry.
- Only a few syntax entries state which experimental feature they need, so the missing-feature warning covers little for now.
- Autocomplete for events, effects and conditions uses a small curated list, not the whole docs database.

## Development

Needs Node.js 18 or newer.

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run check:parser  # parser and diagnostics checks
npm run build         # bundle with esbuild -> dist/extension.js
npm run watch         # rebuild on change, for F5 (Extension Development Host)
npm run package       # produce a .vsix
npm run release:dry   # typecheck and package, publishes nothing
npm run release       # typecheck, package, confirm, publish to the Marketplace and Open VSX
```

Press F5 in VS Code or VSCodium to try it, or install the built `.vsix` with "Install from VSIX". The icon is generated by `python3 scripts/generate-icon.py` (needs Pillow).

Releases: a merge to `main` that changes the version in `package.json` runs the `Publish` workflow, which publishes to the Marketplace with Trusted Publishing (no stored token) and to Open VSX with the `OVSX_PAT` repository secret. It can also be run by hand from the Actions tab. `npm run release` does the same locally with `VSCE_PAT` and `OVSX_PAT` from the environment.

## License

GPL-3.0-only. See [LICENSE](LICENSE).

---

<div align="center">

Thanks, R4T Out.

</div>
