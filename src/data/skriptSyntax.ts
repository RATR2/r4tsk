/**
 * Curated core of vanilla Skript syntax. This is intentionally a hand-picked
 * subset (not every addon syntax element that exists) so completion/hover
 * results stay accurate. Extend these lists as needed.
 */

export interface BuiltinFunctionParam {
  name: string;
  type: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface BuiltinFunction {
  name: string;
  params: BuiltinFunctionParam[];
  returnType: string;
  description: string;
}

export interface BuiltinSyntax {
  name: string;
  kind: "event" | "effect" | "condition" | "expression" | "type";
  pattern: string;
  description: string;
  example?: string;
}

export const BUILTIN_FUNCTIONS: BuiltinFunction[] = [
  {
    name: "vector",
    params: [
      { name: "x", type: "number" },
      { name: "y", type: "number" },
      { name: "z", type: "number" },
    ],
    returnType: "vector",
    description: "Creates a new vector with the given x, y and z components.",
  },
  {
    name: "location",
    params: [
      { name: "x", type: "number" },
      { name: "y", type: "number" },
      { name: "z", type: "number" },
      { name: "world", type: "world", optional: true, defaultValue: "event-world" },
      { name: "yaw", type: "number", optional: true, defaultValue: "0" },
      { name: "pitch", type: "number", optional: true, defaultValue: "0" },
    ],
    returnType: "location",
    description: "Creates a new location from the given coordinates.",
  },
  {
    name: "date",
    params: [
      { name: "year", type: "number" },
      { name: "month", type: "number" },
      { name: "day", type: "number" },
      { name: "hour", type: "number", optional: true, defaultValue: "0" },
      { name: "minute", type: "number", optional: true, defaultValue: "0" },
      { name: "second", type: "number", optional: true, defaultValue: "0" },
    ],
    returnType: "date",
    description: "Creates a new date from the given components.",
  },
  {
    name: "time",
    params: [
      { name: "hour", type: "number" },
      { name: "minute", type: "number", optional: true, defaultValue: "0" },
    ],
    returnType: "time",
    description: "Creates a new in-game time value.",
  },
];

export const BUILTIN_EVENTS: BuiltinSyntax[] = [
  { name: "join", kind: "event", pattern: "on join", description: "Called when a player joins the server." },
  { name: "quit", kind: "event", pattern: "on quit", description: "Called when a player leaves the server." },
  { name: "death", kind: "event", pattern: "on death [of <entity type>]", description: "Called when an entity dies." },
  { name: "respawn", kind: "event", pattern: "on respawn", description: "Called when a player respawns." },
  { name: "block break", kind: "event", pattern: "on break", description: "Called when a player breaks a block." },
  { name: "block place", kind: "event", pattern: "on place", description: "Called when a player places a block." },
  { name: "damage", kind: "event", pattern: "on damage", description: "Called when an entity takes damage." },
  { name: "chat", kind: "event", pattern: "on chat", description: "Called when a player sends a chat message." },
  { name: "interact", kind: "event", pattern: "on right click / left click", description: "Called when a player clicks a block, entity or air." },
  { name: "command", kind: "event", pattern: "on command", description: "Called when any player-issued command is run (before Skript command handling)." },
  { name: "world load", kind: "event", pattern: "on load", description: "Called when a world is loaded." },
  { name: "script load", kind: "event", pattern: "on script load", description: "Called when this script loads." },
  { name: "script unload", kind: "event", pattern: "on script unload", description: "Called when this script unloads." },
];

export const BUILTIN_EFFECTS: BuiltinSyntax[] = [
  { name: "set", kind: "effect", pattern: "set <expr> to <value>", description: "Assigns a value to a variable or changeable expression." },
  { name: "add", kind: "effect", pattern: "add <value> to <expr>", description: "Adds a value to a variable, list variable, or number." },
  { name: "remove", kind: "effect", pattern: "remove <value> from <expr>", description: "Removes a value from a variable, list, or number." },
  { name: "delete", kind: "effect", pattern: "delete <expr>", description: "Deletes a variable entirely." },
  { name: "clear", kind: "effect", pattern: "clear <list variable>", description: "Clears all values of a list variable." },
  { name: "send", kind: "effect", pattern: "send <text> to <player>", description: "Sends a chat message to a player or command sender." },
  { name: "broadcast", kind: "effect", pattern: "broadcast <text>", description: "Sends a message to all players on the server." },
  { name: "teleport", kind: "effect", pattern: "teleport <entity> to <location>", description: "Teleports an entity to a location." },
  { name: "give", kind: "effect", pattern: "give <item> to <player>", description: "Gives an item to a player's inventory." },
  { name: "kill", kind: "effect", pattern: "kill <entity>", description: "Kills an entity." },
  { name: "heal", kind: "effect", pattern: "heal <entity>", description: "Heals an entity to full health." },
  { name: "damage", kind: "effect", pattern: "damage <entity> by <number>", description: "Damages an entity by an amount of hearts." },
  { name: "cancel event", kind: "effect", pattern: "cancel event", description: "Cancels the event currently being handled." },
  { name: "wait", kind: "effect", pattern: "wait <timespan>", description: "Pauses the trigger for the given duration." },
  { name: "stop", kind: "effect", pattern: "stop", description: "Stops the current trigger/loop from executing further." },
];

export const BUILTIN_CONDITIONS: BuiltinSyntax[] = [
  { name: "is", kind: "condition", pattern: "<expr> is <value>", description: "Compares two values for equality." },
  { name: "contains", kind: "condition", pattern: "<expr> contains <value>", description: "Checks whether a list/inventory/text contains a value." },
  { name: "has permission", kind: "condition", pattern: "<player> has permission <text>", description: "Checks whether a player has a permission node." },
  { name: "is online", kind: "condition", pattern: "<player> is online", description: "Checks whether a player is currently online." },
  { name: "is set", kind: "condition", pattern: "<expr> is set", description: "Checks whether a variable or expression currently holds a value." },
  { name: "exists", kind: "condition", pattern: "<expr> exists", description: "Checks whether an expression (e.g. a world or entity) still exists." },
];

export const BUILTIN_TYPES: BuiltinSyntax[] = [
  { name: "string", kind: "type", pattern: "string", description: "A literal, unformatted piece of text." },
  { name: "text", kind: "type", pattern: "text", description: "Any text value, may include formatted/variable content." },
  { name: "number", kind: "type", pattern: "number", description: "Any decimal or whole number." },
  { name: "boolean", kind: "type", pattern: "boolean", description: "A true/false value." },
  { name: "object", kind: "type", pattern: "object", description: "Any value at all - the most generic type." },
  { name: "player", kind: "type", pattern: "player", description: "An online player." },
  { name: "offlineplayer", kind: "type", pattern: "offlineplayer", description: "A player, online or not." },
  { name: "entity", kind: "type", pattern: "entity", description: "Any entity (players, mobs, etc.)." },
  { name: "item", kind: "type", pattern: "item", description: "An item stack, e.g. held or in an inventory." },
  { name: "itemtype", kind: "type", pattern: "itemtype", description: "An item type, optionally with amount/enchantments, used for matching or creating items." },
  { name: "location", kind: "type", pattern: "location", description: "A position in a world, with x/y/z and optionally yaw/pitch." },
  { name: "world", kind: "type", pattern: "world", description: "A Minecraft world." },
  { name: "block", kind: "type", pattern: "block", description: "A block in a world." },
  { name: "inventory", kind: "type", pattern: "inventory", description: "A player or block inventory." },
  { name: "vector", kind: "type", pattern: "vector", description: "A 3D direction/offset with x/y/z components." },
  { name: "date", kind: "type", pattern: "date", description: "A specific point in time." },
  { name: "timespan", kind: "type", pattern: "timespan", description: "A duration, e.g. '5 minutes'." },
  { name: "color", kind: "type", pattern: "color", description: "A color, e.g. for dye or chat formatting." },
];

export function findBuiltinFunction(name: string): BuiltinFunction | undefined {
  const lower = name.toLowerCase();
  return BUILTIN_FUNCTIONS.find((f) => f.name.toLowerCase() === lower);
}

export function findBuiltinType(name: string): BuiltinSyntax | undefined {
  const lower = name.toLowerCase();
  return BUILTIN_TYPES.find((t) => t.name.toLowerCase() === lower);
}

export function allBuiltinSyntax(): BuiltinSyntax[] {
  return [...BUILTIN_EVENTS, ...BUILTIN_EFFECTS, ...BUILTIN_CONDITIONS, ...BUILTIN_TYPES];
}
