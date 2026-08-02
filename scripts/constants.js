/**
 * Velvet Move — shared constants.
 *
 * @module constants
 */

export const MODULE_ID = "velvet-move";

/** Nombre legible, para notificaciones y prefijos de log. */
export const MODULE_TITLE = "Velvet Move";

/** The isometric module we are built to sit alongside. */
export const ISO_ID = "isometric-perspective";

/** Setting keys, all registered under {@link MODULE_ID}. */
export const SETTINGS = Object.freeze({
  HOP_ENABLED: "hopEnabled",
  HOP_HEIGHT: "hopHeight",
  STEP_LENGTH: "stepLength",
  IGNORE_ELEVATED: "ignoreElevated",
  SOUND_ENABLED: "soundEnabled",
  MASTER_VOLUME: "masterVolume",
  AUDIENCE: "audience",
  PITCH_VARIATION: "pitchVariation",
  SURFACES: "surfaces",
  DEFAULT_SURFACE: "defaultSurface",
  /**
   * Lo escribe el cliente del GM cuando Patreon verifica la suscripción y lo
   * lee todo el mundo, para que ningún jugador tenga que hablar con el
   * servidor de licencias. No gatea nada: ver scripts/license/.
   */
  WORLD_LICENSED: "worldLicensed",
  LICENSE_MENU: "licenseMenu"
});

/** Who gets to hear a token's footsteps. */
export const AUDIENCE = Object.freeze({
  ALL: "all",
  OWNED: "owned",
  CONTROLLED: "controlled"
});

/** Scene / token flag holding the surface a token walks on. */
export const SURFACE_FLAG = "surface";

/** How long the token takes to come back down when a walk is cut short (ms). */
export const LAND_MS = 130;

/**
 * A move longer than this many grid cells in a single frame is a teleport,
 * not a stride: no hop, no footsteps, and the step phase starts over.
 */
export const TELEPORT_CELLS = 3;

/** Never fire two footsteps closer together than this (ms). */
export const MIN_STEP_INTERVAL = 70;

/** Audio files we will pick up when a whole folder is added to a surface. */
export const AUDIO_EXTENSIONS = [".ogg", ".mp3", ".wav", ".webm", ".m4a", ".opus", ".flac"];

/**
 * The surface library a fresh install starts with. Labels are localization
 * keys; the menu localizes them, and anything it cannot resolve (a surface the
 * user named themselves) is shown verbatim.
 */
export function defaultSurfaces() {
  const make = (id, icon) => [id, {
    id,
    label: `VELVETMOVE.surfaces.${id}`,
    icon,
    sounds: [],
    volume: 1
  }];

  return Object.fromEntries([
    make("stone", "fa-solid fa-mountain"),
    make("wood", "fa-solid fa-tree"),
    make("grass", "fa-solid fa-seedling"),
    make("dirt", "fa-solid fa-shovel"),
    make("sand", "fa-solid fa-hourglass-half"),
    make("gravel", "fa-solid fa-cubes-stacked"),
    make("water", "fa-solid fa-water"),
    make("snow", "fa-solid fa-snowflake"),
    make("metal", "fa-solid fa-gear"),
    make("carpet", "fa-solid fa-rug")
  ]);
}
