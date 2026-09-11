/**
 * Velvet Move — saving, exporting and importing a setup.
 *
 * Three ways out of a world, deliberately, because they answer different
 * questions:
 *
 * - **Presets** are JSON files under `velvet-move-presets/` in the Foundry
 *   data directory. They live on the *server*, next to the sound files they
 *   point at, so every world on that installation sees the same list — which
 *   is what "use it in my other worlds" actually needs.
 * - **Export** downloads the same JSON to the machine, for moving between
 *   installations or keeping a backup.
 * - **Paste** takes the JSON straight from the clipboard, for when a file
 *   round-trip is more ceremony than the job deserves.
 *
 * @module config-io
 */

import { MODULE_ID, SETTINGS } from "./constants.js";
import { Settings } from "./settings.js";
import { getSurfaces, saveSurfaces } from "./surfaces.js";
import * as Files from "./files.js";

/** Where presets live, relative to the Foundry data root. */
export const PRESET_FOLDER = "velvet-move-presets";

/** Bumped only when the shape changes in a way an importer must know about. */
const FORMAT_VERSION = 1;

/** The settings carried by an export. Client preferences stay client-side. */
const EXPORTED_SETTINGS = [
  SETTINGS.HOP_HEIGHT,
  SETTINGS.STEP_LENGTH,
  SETTINGS.IGNORE_ELEVATED,
  SETTINGS.MASTER_VOLUME,
  SETTINGS.PITCH_VARIATION,
  SETTINGS.AUDIENCE,
  SETTINGS.DEFAULT_SURFACE
];

/**
 * @typedef {object} VelvetMoveConfig
 * @property {string} module
 * @property {number} format
 * @property {string} exportedAt
 * @property {string} [name]
 * @property {Record<string, object>} surfaces
 * @property {Record<string, *>} settings
 */

/**
 * Snapshot the current configuration.
 * @param {object} [options]
 * @param {string} [options.name]  A label to carry with the file.
 * @returns {VelvetMoveConfig}
 */
export function buildConfig({ name } = {}) {
  const settings = {};
  for (const key of EXPORTED_SETTINGS) settings[key] = Settings.get(key);

  return {
    module: MODULE_ID,
    format: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    world: game.world?.id ?? null,
    ...(name ? { name } : {}),
    surfaces: getSurfaces(),
    settings
  };
}

/** @returns {string} The configuration as pretty JSON. */
export function serializeConfig(options) {
  return JSON.stringify(buildConfig(options), null, 2);
}

/**
 * Parse and sanity-check a configuration blob.
 *
 * Import is the one place a hand-edited or foreign file reaches the settings
 * store, so nothing is trusted: unknown keys are dropped, every field is
 * coerced to its expected type, and a file that carries no usable surface is
 * rejected rather than silently wiping the library.
 *
 * @param {string} text
 * @returns {VelvetMoveConfig}
 * @throws {Error} With a message worth showing the user.
 */
export function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(game.i18n.localize("VELVETMOVE.error.badJson"));
  }

  if (!data || typeof data !== "object") throw new Error(game.i18n.localize("VELVETMOVE.error.badJson"));
  if (data.module && data.module !== MODULE_ID) {
    throw new Error(game.i18n.format("VELVETMOVE.error.wrongModule", { module: String(data.module) }));
  }

  const surfaces = {};
  for (const [key, raw] of Object.entries(data.surfaces ?? {})) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id ?? key).trim();
    if (!id) continue;
    surfaces[id] = {
      id,
      label: String(raw.label ?? id),
      icon: String(raw.icon ?? "fa-solid fa-shoe-prints"),
      sounds: Array.isArray(raw.sounds) ? raw.sounds.filter(s => typeof s === "string") : [],
      volume: Number.isFinite(Number(raw.volume)) ? Number(raw.volume) : 1
    };
  }
  if (!Object.keys(surfaces).length) throw new Error(game.i18n.localize("VELVETMOVE.error.noSurfaces"));

  const settings = {};
  for (const key of EXPORTED_SETTINGS) {
    if (data.settings && key in data.settings) settings[key] = data.settings[key];
  }

  return {
    module: MODULE_ID,
    format: Number(data.format) || FORMAT_VERSION,
    exportedAt: String(data.exportedAt ?? ""),
    name: data.name ? String(data.name) : undefined,
    surfaces,
    settings
  };
}

/**
 * Write a parsed configuration into this world.
 * @param {VelvetMoveConfig} config
 * @param {object} [options]
 * @param {"replace"|"merge"} [options.mode]  Replace the library, or add to it.
 * @param {boolean} [options.withSettings]    Also apply the carried settings.
 * @returns {Promise<{surfaces: number, added: number}>}
 */
export async function applyConfig(config, { mode = "replace", withSettings = true } = {}) {
  if (!game.user.isGM) throw new Error(game.i18n.localize("VELVETMOVE.notify.gmOnly"));

  const current = getSurfaces();
  const incoming = config.surfaces;

  /* Merge keeps what the world already has and adds what it does not, rather
     than letting an import quietly redefine a floor the GM has already tuned
     — the sounds attached to "stone" here are probably not the ones attached
     to "stone" in the file. */
  const merged = mode === "merge" ? { ...incoming, ...current } : incoming;
  const added = Object.keys(incoming).filter(id => !(id in current)).length;

  await saveSurfaces(merged);

  if (withSettings) {
    for (const [key, value] of Object.entries(config.settings ?? {})) {
      try {
        await Settings.set(key, value);
      } catch (err) {
        console.warn(`${MODULE_ID} | setting "${key}" refused the imported value`, err);
      }
    }
  }

  // A default pointing at a surface the import did not bring would leave the
  // world with no resolvable floor at all.
  const fallback = Settings.get(SETTINGS.DEFAULT_SURFACE);
  if (!merged[fallback]) await Settings.set(SETTINGS.DEFAULT_SURFACE, Object.keys(merged)[0]);

  return { surfaces: Object.keys(merged).length, added };
}

/* -------------------------------------------- */
/*  Presets on the server                       */
/* -------------------------------------------- */

/** Turn a display name into a safe file name. */
function presetFileName(name) {
  const slug = String(name).slugify?.({ strict: true }) || String(name).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${slug || "preset"}.json`;
}

/**
 * The presets stored on this Foundry installation.
 * @returns {Promise<Array<{name: string, path: string, file: string}>>}
 */
export async function listPresets() {
  try {
    const { files } = await Files.browse(PRESET_FOLDER);
    return files
      .filter(path => path.toLowerCase().endsWith(".json"))
      .map(path => {
        const file = decodeURIComponent(path.split("/").pop());
        return { name: file.replace(/\.json$/i, ""), path, file };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // No folder yet simply means no presets yet.
    return [];
  }
}

/**
 * Save the current configuration as a named preset.
 * @param {string} name
 * @returns {Promise<string>} The stored path.
 */
export async function savePreset(name) {
  const text = serializeConfig({ name });
  return Files.writeTextFile(PRESET_FOLDER, presetFileName(name), text);
}

/**
 * Read a preset back.
 * @param {string} path
 * @returns {Promise<VelvetMoveConfig>}
 */
export async function loadPreset(path) {
  return parseConfig(await Files.readTextFile(path));
}

/**
 * Suggested file name for a manual export.
 * @returns {string}
 */
export function exportFileName() {
  const stamp = new Date().toISOString().slice(0, 10);
  const world = game.world?.id ?? "world";
  return `velvet-move-${world}-${stamp}.json`;
}
