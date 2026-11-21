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
}

export const ADDON_FUNCTIONS: AddonFunction[] = [
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
  { name: "quaternion", signature: "quaternion(x: number = [[integer:0]], y: number = [[integer:0]], z: number = [[integer:0]], w: number = [[integer:1]])", returns: "Quaternion", addons: ["Skript-Particle"] },
  { name: "remove_effects", signature: "remove_effects(potionEffectTypes: objects)", returns: "", addons: ["SkBee"] },
  { name: "resolver", signature: "resolver(placeholder: text, replacement: object, parsable: optional boolean (yes/no))", returns: "", addons: ["SkBee"] },
  { name: "rotation", signature: "rotation(x: number, y: number, z: number)", returns: "Rotations", addons: ["SkAnimation"] },
  { name: "teleport_randomly", signature: "teleport_randomly(diameter: number)", returns: "", addons: ["SkBee"] },
  { name: "timespan", signature: "timespan(time: number, timePeriod: time period)", returns: "Timespan", addons: ["SkBee"] },
  { name: "trail", signature: "trail(target: location, color: color, duration: time span)", returns: "", addons: ["SkBee"] },
  { name: "vibration", signature: "vibration(to: location, arrivalTime: timespan)", returns: "vibration", addons: ["Skript-Particle", "SkBee"] },
  { name: "xor", signature: "xor(a: number, b: number)", returns: "Number", addons: ["skript-math"] },
];

const BY_NAME = new Map(ADDON_FUNCTIONS.map((f) => [f.name.toLowerCase(), f]));

export function findAddonFunction(name: string): AddonFunction | undefined {
  return BY_NAME.get(name.toLowerCase());
}
