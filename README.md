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
- **`local function` support** - recognized as its own header (not treated as a variant of `function`), and its scoping is enforced correctly everywhere: calls only resolve to it from within its own script, autocomplete only offers it there too, and the "duplicate function" diagnostic won't flag two unrelated local functions in different files that happen to share a name (only a real same-file collision, or two *global* functions colliding across files, are actual conflicts).
- **Diagnostics**: undefined function calls (with cross-version suggestions), argument count mismatches, duplicate function definitions, stale `@param` doc tags, `@return` documented on a function with no declared return type, and deprecated syntax usage (see below).
- **Go to definition** / **find references** for function calls.
- **Signature help** (parameter hints while typing a call, including per-parameter doc text).
- **Document & workspace symbols** (outline view, `Ctrl+T` search) for functions, commands and events.
- **Real docs lookup, from the Skript wiki's own data - with an actual pattern-matching engine, not just keyword guessing.** `data/docs.json` is a bundled snapshot from [SkriptLang/skript-docs](https://github.com/SkriptLang/skript-docs) (1200+ real conditions/effects/expressions/events/types/functions/structures/sections, each with description, `since` version, deprecation status and examples). `src/parser/patternCompiler.ts` compiles Skript's real syntax pattern language - `[optional]`, `(a|b|c)`, `%type%`/`%-type%`, `<regex>` - into JS `RegExp`s, so hovering a *line* of code identifies exactly which syntax element governs it and which argument text fills which `%placeholder%`, instead of just noticing a keyword happens to appear somewhere on the line. This fixed real bugs the old word-based approach had (e.g. `contains` on `{_inv} contains {_item}` used to resolve to an unrelated entry; `broadcast "hello world"` picked up "world" from inside the string and matched the wrong expression entirely). Word-based lookup (`lookupWord`) is kept as a fallback for hovering a bare identifier with no full-line match.
  - Known limitation: when a pattern has two *wildcard* alternatives back-to-back with no literal anchor between them (e.g. Teleport's `%entities% (to|%direction%) %location%`), regex backtracking can't always tell which one is semantically intended and may attribute argument text to the wrong slot - it still correctly identifies *which* effect/condition/expression matched, just not always the precise per-argument breakdown. A fully correct fix needs real type-aware parsing, which is out of scope.
  - Hovering an `on X:` event header specifically only matches against the `event` category (not the full docs database), so a word that happens to also appear in an unrelated effect/expression's pattern (e.g. "create" in the Lightning effect's `(create|strike) lightning...`) can never make a fake event look valid. An event phrase that doesn't match any real event shows a clear warning instead.
  - Some Skript patterns build a word out of directly-adjacent choice groups rather than a plain literal, e.g. the Explode event's `explo(d(e|ing)|sion)` for "explode"/"exploding"/"explosion" - these are expanded into their real surface forms for lookup purposes, so `on explode:` and friends match correctly instead of only ever seeing meaningless fragments like "explo"/"d"/"sion".
  - docs.json's `id` field is the underlying Skript implementation class, not a unique per-entry identifier - over a hundred distinct events (e.g. "On Explode", "On Projectile Hit") all share the generic id `SimpleEvent`, since they don't need their own dedicated class. Entries get their own internally-generated unique key at load time so candidate resolution and pattern caching can't collide between them; the docs-site link also derives events' anchors from a slug of their name rather than that shared id, matching how the real site links them (`events.html#explode`, not `events.html#SimpleEvent`).
- **Auto-downloads the docs.json matching your Skript version.** skript-docs keeps an archive of every released version at `docs/archives/<version>/docs.json`. Once you tell r4tsk your Skript version (see below), it resolves the closest matching archive, downloads it in the background, and caches it under VS Code's global storage - no manual download needed. Falls back to the bundled snapshot if offline or the exact version isn't available.
  - Covers three generations of the schema: the modern format (Skript 2.13.0+), an older intermediate format (2.10.0-2.12.x, auto-adapted), and gracefully falls back to the nearest supported version for the legacy format (Skript 2.6.4-2.9.5, and 2.10.2) - those older archives use singular-string fields and are sometimes not even valid JSON, so they aren't parsed.
  - Prefer to manage this yourself? Point `r4tsk.docsPath` at your own downloaded/generated `docs.json` (e.g. built from your exact server + addon jars via Skript's `/sk gen-docs` command) and auto-download is skipped entirely - run **"r4tsk: Set Core Docs File..."** to pick the file with a native file browser instead of typing/pasting a path, or clear it from the same command. Set `r4tsk.autoDownloadDocs` to `false` to just stay on the bundled snapshot without network access. Applies live, no reload needed.
- **"You might be thinking of X from Skript Y."** In the background, r4tsk also downloads one docs.json checkpoint per supported Skript minor version (2.10 through the latest). If a keyword or function isn't found in *your* configured version's docs, but exists in a nearby version's, hover and the "undefined function" diagnostic will point you at it - e.g. if something got renamed or added/removed between versions. Disable with `r4tsk.crossVersionSuggestions`.
- **Deprecated-syntax warnings**, scanned directly in your code (not just on hover): every code word (excluding comments, string content, and `{variable}` names) is checked against your active docs database. If it matches something flagged `deprecated`, you get a Warning: *`'X' is deprecated in Skript Y. Please use the newer alternative described in its docs.`* Reuses the same word-based heuristic as hover/completion, so the same accuracy caveats apply.
  - Skript sometimes reorganizes a feature (e.g. an old condition folded into a newer "property" system) with identical syntax - the docs mark the old entry deprecated for one version, then it's gone entirely from the next, with a non-deprecated same-named replacement. Since that's not something to act on, the warning is suppressed if the same name exists, non-deprecated, in a *newer* checkpoint version (checked via the cross-version index above). Only older non-deprecated appearances are ignored, since every deprecated feature was trivially non-deprecated at some earlier point - that direction doesn't mean anything.
  - (An earlier version of this also tried to note "this feature was updated in version X, and you have it" using entries' multi-segment `since` fields, but that turned out to be more noise than signal in practice - most such version bumps are ancient, so it fired on nearly every use of common effects like `set`/`add`/`remove`. Removed.)
- **Skript version tracking** - the first time you open a `.sk` file, r4tsk asks what version of Skript you're running and remembers it. A status bar item at the bottom (`Skript: x.y.z`) shows the current value and can be clicked anytime to change it (or run **"r4tsk: Set Skript Version"** from the Command Palette). If your version's major.minor doesn't match the currently active docs database, the status bar item turns into a warning so you know hover/completion info might not perfectly apply.
- **Addon support (SkBee, Skript-GUI, etc.), via `r4tsk.additionalDocsPaths`.** There's no central registry of addon syntax to download from - but Skript's own `/sk gen-docs` command generates a `docs.json` covering *every addon installed on the server it runs on*, in the exact same schema core Skript's docs use. So:
  1. Spin up a throwaway/dev server with Skript + whichever addons you use (SkBee, Skript-GUI, etc.) installed.
  2. Run `/sk gen-docs` - this produces `plugins/Skript/docs/docs.json`, containing vanilla Skript's syntax *and* every installed addon's.
  3. Copy that file somewhere r4tsk can read it, then run **"r4tsk: Manage Addon Docs Files..."** from the Command Palette - it lists what's currently added (with a trash icon to remove any) and an "Add a docs.json file..." entry that opens a native file browser, so there's no need to hand-edit `r4tsk.additionalDocsPaths` as a raw settings array (you still can, if you prefer - it's the same underlying setting, an array so you can point at multiple files/addons separately if you'd rather keep them apart).
  4. It's merged into the same pattern-matching engine and lookup index as your core Skript docs - hover, diagnostics, and everything else described above work on addon syntax exactly the same as vanilla Skript's. Applies live, no reload needed.
  
  This also means "currently unknown" addons aren't a special case to add support for one at a time - any addon that installs cleanly into a Skript server and shows up in `/sk gen-docs`'s output is supported automatically once its docs.json is added this way.

## Scope note

The built-in syntax database (`src/data/skriptSyntax.ts`) is a small curated core used for
completion snippets; the real depth comes from the (auto-downloaded, version-matched)
`docs.json` and the pattern-matching engine described above. The compiler handles the vast
majority of real patterns correctly (validated against dozens of real conditions/effects/
expressions), but it's still regex-based rather than a true recursive-descent parser with type
inference, so a handful of patterns with ambiguous wildcard-vs-wildcard choices, or multiple
generic same-shaped expressions competing for the same phrasing (e.g. several different "name
of X" expressions across different types), can occasionally resolve to a plausible-but-not-exact
entry. Autocomplete still uses the small curated list rather than the full docs database/pattern
engine - a good next step if it's ever revisited.

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
built `r4tsk-1.0.1.vsix` via the "Install from VSIX" command.

## License

Copyright © 2026 RATR2. All rights reserved. See [LICENSE](LICENSE).
