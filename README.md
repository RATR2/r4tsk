# r4tsk

Skript language support for VS Code / VSCodium.

## Features

- **Syntax highlighting** for `.sk` files (functions, commands, events, variables, types, effects).
- **Minecraft/Bukkit chat color codes** inside strings are rendered live using their real in-game color/style, following actual chat rendering rules (a color code resets formatting, format codes stack, `&r` resets both):
  - Legacy codes `&0`-`&f` (color) and `&l/&m/&n/&o` (bold/strikethrough/underline/italic), e.g. `"&cRed &lbold text"`.
  - Hex tags `<#rrggbb>`, using the *exact* color parsed out of the tag itself, e.g. `"<#f18d8d>this text is actually that pink"`.
  - This part is implemented as live editor decorations (not just static theme colors), since an arbitrary hex value can't be baked into a fixed color theme.
- **Color picker support for `<#rrggbb>` tags** — VS Code's built-in color swatch/picker only recognizes a bare `#rrggbb` with nothing around it by default, so it never matched Skript's `<...>`-wrapped hex tags. A `DocumentColorProvider` is registered for `.sk` files so the swatch shows up next to `<#rrggbb>` tags and picking a new color rewrites the tag correctly (including the brackets).
- **R4TSK Dark theme** — same UI color palette as VS Code's built-in "Dark 2026" theme, with hand-authored syntax colors for Skript instead of the default ones.
- **Hover call-signature preview** — hover over a function call site, e.g. `functionname("123", true, {object})`, and see the function it resolves to:
  ```
  functionname(str: string, bool: boolean, obj: object) :: boolean
  ```
  plus a parameter-by-parameter breakdown of the actual arguments passed, the return type, and the function's doc comment.
- **JavaDoc-style doc comments** — write `#` comments above a function using `@param`/`@return`/`@deprecated` tags and they're parsed structurally, then shown in hover, autocomplete, and signature help (including a per-parameter description column):
  ```
  # Gives a welcome kit to a player.
  #
  # @param str the message to show the player
  # @param bool whether to also play a sound
  # @param obj the target to give the kit to
  # @return whether the kit was given successfully
  # @deprecated use giveKit() instead
  function functionname(str: string, bool: boolean, obj: object) :: boolean:
  ```
  A `@param` that doesn't match an actual parameter name is flagged as a diagnostic (catches doc/signature drift), and so is a `@return` tag on a function that doesn't actually declare a return type.
- **Colored doc/annotation tags** in comments, live and user-configurable (not baked into the static theme):
  - `@param` `#1c91ff`, `@return`/`@returns` `#731cff`, and `@deprecated` `#ffd21c` color just the tag word itself, not the text that follows.
  - General annotation markers, usable in any `#` comment: `TODO` `#1c6fff` and `WARN` `#ffd21c` color just the tag word; `!`/`important` `#ff0000` (interchangeable - use whichever reads better) colors the whole rest of the line, since it's meant to flag the entire note as urgent. No colon required, e.g. `# TODO clean this up` or `# ! don't touch this without asking`.
  - Run **"r4tsk: Configure Annotation Colors"** from the Command Palette to open Settings pre-filtered to `r4tsk.annotationColors.*`, where both foreground *and* background can be changed per tag (e.g. `r4tsk.annotationColors.warn.background`). This is implemented as live editor decorations (like the hex-color feature above) rather than static theme colors, so it applies under any color theme and updates immediately when a setting changes - no reload required.
- **Custom colored patterns** - color any regex pattern you define, anywhere in a `.sk` file (not restricted to comments), via `r4tsk.customPatterns`. Handy for something like an ASCII-art banner comment block at the top of your scripts. Each entry is `{ pattern, color, background?, flags?, bold?, italic? }`; matching runs across the whole document (the `g` flag is always added automatically), so a single pattern can span multiple lines. Run **"r4tsk: Configure Custom Colored Patterns"** to edit the list. Example, for a banner made of `@`/`!`/`:` characters:
  ```json
  "r4tsk.customPatterns": [
    {
      "pattern": "^#[ \\t]*[@!:][@!: \\t]*$",
      "flags": "m",
      "color": "#ff69b4",
      "bold": true
    }
  ]
  ```
  This matches any comment line that (after the `#`) consists only of `@`/`!`/`:` characters and whitespace, so normal prose comments are left alone.
  - r4tsk also ships a **built-in signature banner** (`src/data/signatureBanner.ts`) - a fixed, non-configurable set of patterns that always renders the author's own ASCII-art header comment in its matching gradient, regardless of the viewer's own `r4tsk.customPatterns` settings. So anyone who opens a script bearing that banner, using this build of the extension, sees it colored the same way it looks in-game. It's added on top of (not instead of) whatever the user configures themselves.
- **Autocomplete** for user-defined functions (workspace-wide), a curated core of vanilla Skript events/effects/conditions/types, and already-used variable names.
- **Diagnostics**: undefined function calls (with cross-version suggestions), argument count mismatches, duplicate function definitions, stale `@param` doc tags, `@return` documented on a function with no declared return type, and deprecated syntax usage (see below).
- **Go to definition** / **find references** for function calls.
- **Signature help** (parameter hints while typing a call, including per-parameter doc text).
- **Document & workspace symbols** (outline view, `Ctrl+T` search) for functions, commands and events.
- **Real docs lookup, from the Skript wiki's own data** - `data/docs.json` is a bundled snapshot from [SkriptLang/skript-docs](https://github.com/SkriptLang/skript-docs) (1200+ real conditions/effects/expressions/events/types/functions/structures/sections, each with description, `since` version, deprecation status and examples - not just our small curated list). Hover over any recognized keyword (e.g. `teleport`, `broadcast`, `boolean`, `floor`) to see its real doc entry. This is word-based lookup (not a full Skript pattern-matching engine), so results are a best-effort match, not a syntax-perfect parse.
- **Auto-downloads the docs.json matching your Skript version.** skript-docs keeps an archive of every released version at `docs/archives/<version>/docs.json`. Once you tell r4tsk your Skript version (see below), it resolves the closest matching archive, downloads it in the background, and caches it under VS Code's global storage - no manual download needed. Falls back to the bundled snapshot if offline or the exact version isn't available.
  - Covers three generations of the schema: the modern format (Skript 2.13.0+), an older intermediate format (2.10.0-2.12.x, auto-adapted), and gracefully falls back to the nearest supported version for the legacy format (Skript 2.6.4-2.9.5, and 2.10.2) - those older archives use singular-string fields and are sometimes not even valid JSON, so they aren't parsed.
  - Prefer to manage this yourself? Point `r4tsk.docsPath` at your own downloaded/generated `docs.json` (e.g. built from your exact server + addon jars via Skript's `/sk gen-docs` command) and auto-download is skipped entirely. Set `r4tsk.autoDownloadDocs` to `false` to just stay on the bundled snapshot without network access.
- **"You might be thinking of X from Skript Y."** In the background, r4tsk also downloads one docs.json checkpoint per supported Skript minor version (2.10 through the latest). If a keyword or function isn't found in *your* configured version's docs, but exists in a nearby version's, hover and the "undefined function" diagnostic will point you at it - e.g. if something got renamed or added/removed between versions. Disable with `r4tsk.crossVersionSuggestions`.
- **Deprecated-syntax warnings**, scanned directly in your code (not just on hover): every code word (excluding comments, string content, and `{variable}` names) is checked against your active docs database. If it matches something flagged `deprecated`, you get a Warning: *`'X' is deprecated in Skript Y. Please use the newer alternative described in its docs.`* Reuses the same word-based heuristic as hover/completion, so the same accuracy caveats apply.
  - Skript sometimes reorganizes a feature (e.g. an old condition folded into a newer "property" system) with identical syntax - the docs mark the old entry deprecated for one version, then it's gone entirely from the next, with a non-deprecated same-named replacement. Since that's not something to act on, the warning is suppressed if the same name exists, non-deprecated, in a *newer* checkpoint version (checked via the cross-version index above). Only older non-deprecated appearances are ignored, since every deprecated feature was trivially non-deprecated at some earlier point - that direction doesn't mean anything.
  - (An earlier version of this also tried to note "this feature was updated in version X, and you have it" using entries' multi-segment `since` fields, but that turned out to be more noise than signal in practice - most such version bumps are ancient, so it fired on nearly every use of common effects like `set`/`add`/`remove`. Removed.)
- **Skript version tracking** - the first time you open a `.sk` file, r4tsk asks what version of Skript you're running and remembers it. A status bar item at the bottom (`Skript: x.y.z`) shows the current value and can be clicked anytime to change it (or run **"r4tsk: Set Skript Version"** from the Command Palette). If your version's major.minor doesn't match the currently active docs database, the status bar item turns into a warning so you know hover/completion info might not perfectly apply.

## Scope note

The built-in syntax database (`src/data/skriptSyntax.ts`) is a small curated core used for
completion snippets; the real depth comes from the (auto-downloaded, version-matched)
`docs.json` described above. The word-based docs lookup is a heuristic (exact name match, then
a keyword index built by stripping Skript's pattern syntax), not a full pattern-matching engine,
so occasionally an ambiguous word (like "set", which is genuinely used in more than one effect's
phrasing) may resolve to a plausible-but-not-exact entry. Autocomplete still uses the small
curated list rather than the full docs database - a good next step if it's ever revisited.

## Development

Requires Node.js 18+.

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build        # bundle with esbuild -> dist/extension.js
npm run watch         # rebuild on change, for use with F5 (Extension Development Host)
npm run package       # produce a .vsix via vsce
```

To try it locally: open this folder in VS Code / VSCodium and press F5, or install the
built `r4tsk-0.1.0.vsix` via the "Install from VSIX" command.
