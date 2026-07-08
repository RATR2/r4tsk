import type { CustomPatternRule } from "../providers/customPatternDecorations";

/**
 * r4tsk's author signature banner - a fixed gradient baked into the
 * extension itself (not user-configurable) so anyone who opens a script
 * bearing this banner sees it colored the same way, regardless of their own
 * `r4tsk.customPatterns` settings. Colors match the author's own in-game
 * console gradient for the same banner.
 */
export const SIGNATURE_BANNER_PATTERNS: CustomPatternRule[] = [
  { pattern: "^#\\s*@@@@@@@        @@@   @@@@@@@\\s*$", flags: "m", color: "#FF7FF9", bold: true },
  { pattern: "^#\\s*@@@@@@@@      @@@@   @@@@@@@\\s*$", flags: "m", color: "#FE75F6", bold: true },
  { pattern: "^#\\s*@@!  @@@     @@!@!     @@!\\s*$", flags: "m", color: "#FE6BF3", bold: true },
  { pattern: "^#\\s*!@!  @!@    !@!!@!     !@!\\s*$", flags: "m", color: "#FE61F0", bold: true },
  { pattern: "^#\\s*@!@!!@!    @!! @!!     @!!\\s*$", flags: "m", color: "#FE57ED", bold: true },
  { pattern: "^#\\s*!!@!@!    !!!  !@!     !!!\\s*$", flags: "m", color: "#FE4DEA", bold: true },
  { pattern: "^#\\s*!!: :!!   :!!:!:!!:    !!:\\s*$", flags: "m", color: "#FD43E7", bold: true },
  { pattern: "^#\\s*:!:  !:!  !:::!!:::    :!:\\s*$", flags: "m", color: "#FD39E4", bold: true },
  { pattern: "^#\\s*::   :::       :::      ::\\s*$", flags: "m", color: "#FD2FE1", bold: true },
  { pattern: "^#\\s*:   : :       :::      :\\s*$", flags: "m", color: "#FD25DE", bold: true },
];
