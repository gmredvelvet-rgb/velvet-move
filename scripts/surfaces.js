/**
 * Velvet Move — the surface library.
 *
 * A surface is a floor material with a bag of footstep samples. Which surface
 * a step uses is resolved in three tiers, most specific first:
 *
 *   1. a flag on the token   — the knight in plate clanks wherever they go
 *   2. a flag on the scene   — the GM sets the tavern to wood, the cave to stone
 *   3. the world default     — everything else
 *
 * @module surfaces
 */

import { MODULE_ID, SETTINGS, SURFACE_FLAG, defaultSurfaces } from "./constants.js";
import { Settings } from "./settings.js";
import { refreshControls } from "./ui-refresh.js";
import { BRIDGE_ID, bridgeApi } from "./talespire-context.js";

function soundScene() {
  if (Settings.talespireEcosystem && bridgeApi() && !canvas?.ready) {
    const runtime = game.scenes?.contents?.find(scene => scene.getFlag?.(BRIDGE_ID, "runtimeScene") === true);
    if (runtime) return runtime;
  }
  return canvas?.scene ?? game.scenes?.current ?? null;
}

/** @returns {Record<string, object>} The stored library, never empty. */
export function getSurfaces() {
  const stored = Settings.get(SETTINGS.SURFACES, null);
  if (!stored || typeof stored !== "object" || !Object.keys(stored).length) return defaultSurfaces();

  // A surface that lost its id (hand-edited settings, a bad merge) would be
  // unreachable from the UI, so re-key it from the entry it is filed under.
  return Object.fromEntries(Object.entries(stored).map(([id, surface]) => [id, {
    id,
    label: surface?.label ?? id,
    icon: surface?.icon ?? "fa-solid fa-shoe-prints",
    sounds: Array.isArray(surface?.sounds) ? surface.sounds.filter(s => typeof s === "string") : [],
    volume: Number.isFinite(surface?.volume) ? surface.volume : 1
  }]));
}

/** @returns {Promise<void>} */
export async function saveSurfaces(surfaces) {
  await Settings.set(SETTINGS.SURFACES, surfaces);
}

/** The label to show for a surface — a localization key, or plain text. */
export function surfaceLabel(surface) {
  const label = surface?.label ?? "";
  const localized = game.i18n.localize(label);
  return localized === label ? label : localized;
}

/** @returns {string} The surface id this scene walks on. */
export function getSceneSurfaceId(scene = soundScene()) {
  const flagged = scene?.getFlag(MODULE_ID, SURFACE_FLAG);
  const surfaces = getSurfaces();
  if (flagged && surfaces[flagged]) return flagged;
  const fallback = Settings.get(SETTINGS.DEFAULT_SURFACE, "stone");
  return surfaces[fallback] ? fallback : Object.keys(surfaces)[0];
}

/**
 * Point the current scene at a surface. GM-only: it is world state that every
 * client reads when a token walks.
 * @param {string} id
 */
export async function setSceneSurfaceId(id) {
  if (!game.user.isGM) return;
  const scene = soundScene();
  if (!scene) return;
  await scene.setFlag(MODULE_ID, SURFACE_FLAG, id);
  refreshControls();
}

/**
 * Pin a surface onto specific tokens, overriding the scene.
 * @param {TokenDocument[]} tokenDocs
 * @param {string|null} id  A surface id, or null to fall back to the scene.
 */
export async function setTokenSurfaceId(tokenDocs, id) {
  const updates = tokenDocs.map(doc => id === null
    ? { _id: doc.id, [`flags.${MODULE_ID}.-=${SURFACE_FLAG}`]: null }
    : { _id: doc.id, [`flags.${MODULE_ID}.${SURFACE_FLAG}`]: id });
  if (!updates.length) return;
  const scenes = new Map();
  for (let index = 0; index < tokenDocs.length; index++) {
    const scene = tokenDocs[index].parent;
    if (!scene) continue;
    const group = scenes.get(scene) ?? [];
    group.push(updates[index]);
    scenes.set(scene, group);
  }
  for (const [scene, group] of scenes) await scene.updateEmbeddedDocuments("Token", group);
}

/**
 * The surface a given token is currently walking on.
 * @param {Token} token
 * @returns {object|null}
 */
export function resolveSurface(token) {
  const surfaces = getSurfaces();
  const own = token?.document?.getFlag(MODULE_ID, SURFACE_FLAG);
  if (own && surfaces[own]) return surfaces[own];
  const sceneId = getSceneSurfaceId(token?.document?.parent ?? token?.scene ?? canvas?.scene);
  return surfaces[sceneId] ?? null;
}
