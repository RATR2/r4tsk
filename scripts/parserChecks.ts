/** Regression checks for the pattern compiler and unrecognized-syntax detection. Run with `npm run check:parser` from the repo root. */
import * as path from "path";
import { compilePattern } from "../src/parser/patternCompiler";
import { DocsDatabase } from "../src/data/docsDatabase";
import { findUnrecognizedLines } from "../src/parser/unrecognizedSyntax";

let failures = 0;
function check(name: string, ok: boolean): void {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
}
const matches = (pattern: string, text: string): boolean => compilePattern(pattern).regex.test(text);

// `|` inside `[...]` is an alternation, not a literal pipe.
check("[a|b] matches a", matches("x[ |-]hand", "x hand"));
check("[a|b] matches b", matches("x[ |-]hand", "x-hand"));
check("[a|b] optional (absent)", matches("x[ |-]hand", "xhand"));
check("[a|b] no literal pipe", !matches("x[ |-]hand", "x|hand"));
check("off[ |-]hand[s]", ["off hand", "off-hand", "offhand", "offhands"].every((t) => matches("off[ |-]hand[s]", t)));
check("nested alternation in optional", matches("[the] [entire|additional] tool[ ]tip[s]", "additional tooltips"));
check("nested alternation in optional (absent)", matches("[the] [entire|additional] tool[ ]tip[s]", "the tool tip"));
check("(a|b) unchanged", matches("(a|b) c", "b c") && !matches("(a|b) c", "c c"));
check("[(a|b)|c] nesting", matches("[(a|b)|c] d", "c d") && matches("[(a|b)|c] d", "a d"));

const db = DocsDatabase.loadMultiple(path.join(process.cwd(), "data", "docs.json"), []);
check("docs loaded", !!db);
if (db) {
  const run = (src: string) => findUnrecognizedLines(src.split("\n"), db).map((r) => r.line + 1);
  check("no docs -> nothing", findUnrecognizedLines(["on join:", "\tflurble"], undefined).length === 0);
  check("valid body lines pass", run('on join:\n\tsend "hi" to player\n\tset {_x} to 5\n\twait 1 second\n\tif {_x} is 5:\n\t\tstop').length === 0);
  check("gibberish flagged", run("function f():\n\tsend \"a\" to player\n\tflurble the wobble").join() === "3");
  check("comment/blank/variable/call skipped", run("on join:\n\t# hi\n\n\t{_x}\n\tfoo(1)\n\tsend \"%player%\" to player").length === 0);
  check("options/using ignored", run("options:\n\tx: flurble\nusing zork\nvariables:\n\t{a} = blarg").length === 0);
  check("command settings ignored, trigger checked", run("command /x:\n\tpermission: a.b\n\ttrigger:\n\t\tblarg zork").join() === "4");
  check("code-level %expr% skipped", run("on join:\n\tblarg %player%").length === 0);
  check("children of unknown section skipped", run("on join:\n\tflurble the thing:\n\t\tblarg zork").length === 0);
  const timing = (() => {
    const lines = ("on join:\n" + '\tsend "hi" to player\n\tset {_x} to 5\n\tflurble zork\n'.repeat(500)).split("\n");
    const t = performance.now();
    findUnrecognizedLines(lines, db);
    return performance.now() - t;
  })();
  check(`1500-line scan under 1s (${timing.toFixed(0)}ms)`, timing < 1000);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
