/**
 * Functions registered by popular Skript addons, so calls to them aren't
 * reported as undefined when the addon's docs.json isn't loaded.
 * Generated from the SkriptHub addon syntax list (https://skripthub.net/api/);
 * core Skript functions live in the docs database instead.
 */
export interface AddonFunction {
  name: string;
  signature: string;
  returns: string;
  addons: string[];
  /** Only present for functions converted live from SkriptHub (the bundled snapshot has no descriptions). */
  description?: string;
}

const RAW_ADDON_FUNCTIONS: AddonFunction[] = [
  { name: "and", signature: "and(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
  { name: "apply_effects", signature: "apply_effects(potion effects: objects, probability: number)", returns: "", addons: ["SkBee"] },
  { name: "attachment", signature: "attachment(object: string)", returns: "Object", addons: ["skJson"] },
  { name: "axisAngle", signature: "axisAngle(angle: number, x: number, y: number, z: number)", returns: "Quaternion", addons: ["Skript-Particle"] },
  { name: "axisAngleDegrees", signature: "axisAngleDegrees(angle: number, x: number, y: number, z: number)", returns: "Quaternion", addons: ["Skript-Particle"] },
  { name: "bukkitColor", signature: "bukkitColor(alpha: number, red: number, green: number, blue: number)", returns: "", addons: ["SkBee"] },
  { name: "clear_all_effects", signature: "clear_all_effects()", returns: "", addons: ["SkBee"] },
  { name: "dustOption", signature: "dustOption(color: color, size: number)", returns: "dustoption", addons: ["Skript-Particle", "SkBee"] },
  { name: "dustTransition", signature: "dustTransition(fromColor: color, toColor: color, size: number)", returns: "dusttransition", addons: ["Skript-Particle", "SkBee"] },
  { name: "factorial", signature: "factorial(x: number)", returns: "Number", addons: ["skript-math"] },
  { name: "formattedTimespan", signature: "formattedTimespan(timespan: time span, format: text)", returns: "Text", addons: ["SkBee"] },
  { name: "gamma", signature: "gamma(x: number)", returns: "Number", addons: ["skript-math"] },
  { name: "geyser", signature: "geyser(water_blocks: number)", returns: "", addons: ["SkBee"] },
  { name: "geyserbase", signature: "geyserbase(water_blocks: number, burst_impulse_base: number)", returns: "", addons: ["SkBee"] },
  { name: "nand", signature: "nand(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
  { name: "nor", signature: "nor(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
  { name: "nxor", signature: "nxor(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
  { name: "or", signature: "or(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
  { name: "pair", signature: "pair(first: object, second: object)", returns: "Pair", addons: ["SkCheese"] },
  { name: "particleSpell", signature: "particleSpell(color: color, power: number)", returns: "", addons: ["SkBee"] },
  { name: "peaksAndValleys", signature: "peaksAndValleys(number: number)", returns: "Number", addons: ["SkBee"] },
  { name: "play_sound", signature: "play_sound(sound: text)", returns: "", addons: ["SkBee"] },
  { name: "quaternion", signature: "quaternion(x: number = 0, y: number = 0, z: number = 0, w: number = 1)", returns: "Quaternion", addons: ["Skript-Particle"] },
  { name: "remove_effects", signature: "remove_effects(potionEffectTypes: objects)", returns: "", addons: ["SkBee"] },
  { name: "resolver", signature: "resolver(placeholder: text, replacement: object, parsable: optional boolean (yes/no))", returns: "", addons: ["SkBee"] },
  { name: "rotation", signature: "rotation(x: number, y: number, z: number)", returns: "Rotations", addons: ["SkAnimation"] },
  { name: "teleport_randomly", signature: "teleport_randomly(diameter: number)", returns: "", addons: ["SkBee"] },
  { name: "timespan", signature: "timespan(time: number, timePeriod: time period)", returns: "Timespan", addons: ["SkBee"] },
  { name: "trail", signature: "trail(target: location, color: color, duration: time span)", returns: "", addons: ["SkBee"] },
  { name: "vibration", signature: "vibration(to: location, arrivalTime: timespan)", returns: "vibration", addons: ["Skript-Particle", "SkBee"] },
  { name: "xor", signature: "xor(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
];

/** SkriptHub marks default values as `[[type:value]]` (e.g. `x: number = [[integer:0]]`); reduces that to the plain value. */
export function cleanSignature(signature: string): string {
  return signature.replace(/\[\[[A-Za-z_]+:([^\]]*)\]\]/g, "$1").trim();
}

export interface AddonParam {
  name: string;
  type: string;
  optional: boolean;
  /** The parameter exactly as written in the signature, e.g. `x: number = 0`. */
  label: string;
}

export interface ParsedSignature {
  params: AddonParam[];
  /** True only when every parameter parsed as `name: type [= default]` and none is a list type, so an argument count check can be trusted. */
  reliable: boolean;
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === ">") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Parses `name(a: type, b: type = default, c: optional type)`. Argument
 * counts are only trusted (`reliable`) when every parameter parsed and none
 * has a plural type (`numbers`, `objects`): in Skript a list parameter takes
 * any number of comma-separated arguments, so counting would give false
 * positives.
 */
export function parseSignature(signature: string): ParsedSignature | undefined {
  const m = /^\s*[A-Za-z_]\w*\s*\((.*)\)\s*(?:::\s*.+)?$/s.exec(cleanSignature(signature));
  if (!m) return undefined;
  const inner = m[1].trim();
  if (inner === "") return { params: [], reliable: true };

  const params: AddonParam[] = [];
  let reliable = true;
  for (const raw of splitTopLevelCommas(inner)) {
    const pm = /^\s*([^:=]+?)\s*:\s*(.*?)\s*$/s.exec(raw);
    if (!pm) {
      reliable = false;
      continue;
    }
    let type = pm[2];
    let optional = false;
    const eq = type.indexOf("=");
    if (eq !== -1) {
      optional = true;
      type = type.slice(0, eq).trim();
    }
    if (/^optional\s/i.test(type)) {
      optional = true;
      type = type.replace(/^optional\s+/i, "");
    }
    const baseType = type.replace(/\(.*?\)/g, "").replace(/\s+(between|from)\s.*$/i, "").trim();
    if (baseType === "" || /s$/i.test(baseType)) reliable = false;
    params.push({ name: pm[1], type, optional, label: raw.trim() });
  }
  return { params, reliable };
}

function dedupeByName(list: AddonFunction[]): AddonFunction[] {
  const byName = new Map<string, AddonFunction>();
  for (const f of list) {
    const key = f.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) byName.set(key, { ...f, signature: cleanSignature(f.signature), addons: [...f.addons] });
    else for (const a of f.addons) if (!prev.addons.includes(a)) prev.addons.push(a);
  }
  return [...byName.values()];
}

/** Bundled snapshot, one entry per function name (a name from several addons lists them all). */
export const ADDON_FUNCTIONS: AddonFunction[] = dedupeByName(RAW_ADDON_FUNCTIONS);

/**
 * Which addon functions count as "known", depending on what the user chose:
 * with addons selected (`r4tsk.addons`) only functions of those addons are
 * known - the bundled snapshot narrowed to them, plus whatever was converted
 * live from SkriptHub - so generic names like `and`, `pair` or `trail` from an
 * addon the user doesn't use no longer hide a real "undefined function"
 * warning. With nothing selected, the whole bundled list applies as before.
 */
let selectedAddons = new Set<string>();
let liveFunctions: AddonFunction[] = [];
let byName = new Map<string, AddonFunction[]>();

function rebuildIndex(): void {
  byName = new Map();
  const add = (f: AddonFunction) => {
    const key = f.name.toLowerCase();
    const list = byName.get(key) ?? [];
    const sig = cleanSignature(f.signature);
    if (!list.some((x) => x.signature === sig)) list.push({ ...f, signature: sig });
    byName.set(key, list);
  };
  if (selectedAddons.size === 0) {
    ADDON_FUNCTIONS.forEach(add);
    return;
  }
  for (const f of liveFunctions) add(f);
  for (const f of ADDON_FUNCTIONS) {
    const addons = f.addons.filter((a) => selectedAddons.has(a.toLowerCase()));
    if (addons.length > 0) add({ ...f, addons });
  }
}
rebuildIndex();

export function configureAddonFunctions(selected: string[], live: AddonFunction[] = []): void {
  selectedAddons = new Set(selected.map((a) => a.toLowerCase()));
  liveFunctions = live;
  rebuildIndex();
}

/** Every known addon function with this name (several addons may define it with different signatures). */
export function findAddonFunctions(name: string): AddonFunction[] {
  return byName.get(name.toLowerCase()) ?? [];
}

export function findAddonFunction(name: string): AddonFunction | undefined {
  return findAddonFunctions(name)[0];
}
