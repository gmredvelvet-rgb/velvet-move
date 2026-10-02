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

/** theripper93's 3D Canvas, the third way a scene can be drawn. */
export const CANVAS3D_ID = "levels-3d-preview";

/**
 * 3D Canvas measures its scene in canvas pixels divided by this. Read from
 * the live module when it is running; this is the fallback for reporting
 * before it has loaded.
 */
export const THREE_FACTOR = 1000;

/** How a scene is drawn, and therefore what direction the hop travels in. */
export const RENDERERS = Object.freeze({
  /** Follow whatever the canvas is actually doing. */
  AUTO: "auto",
  /** Top-down: straight up the screen. */
  FLAT: "2d",
  /** Isometric Perspective: up, as its projection defines up. */
  ISOMETRIC: "isometric",
  /** 3D Canvas: up the world's vertical axis. */
  THREE: "3d"
});

/** Setting keys, all registered under {@link MODULE_ID}. */
export const SETTINGS = Object.freeze({
  HOP_ENABLED: "hopEnabled",
  HOP_HEIGHT: "hopHeight",
  STEP_LENGTH: "stepLength",
  IGNORE_ELEVATED: "ignoreElevated",
  SOUND_ENABLED: "soundEnabled",
  TALESPIRE_ECOSYSTEM: "talespireEcosystem",
  MASTER_VOLUME: "masterVolume",
  AUDIENCE: "audience",
  PITCH_VARIATION: "pitchVariation",
  SURFACES: "surfaces",
  DEFAULT_SURFACE: "defaultSurface",
  RENDERER: "renderer",
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
    sounds: ["stone", "wood", "grass", "dirt", "gravel", "water"].includes(id)
      ? [`modules/${MODULE_ID}/assets/footsteps/${id}.ogg`] : [],
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
