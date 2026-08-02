/**
 * Velvet Move — settings.
 *
 * The split between world and client scope is deliberate: what the table walks
 * on is the GM's call (the surface library, which floor a scene uses, the
 * stride length), while how loud and how bouncy it is belongs to each player.
 *
 * @module settings
 */

import { MODULE_ID, SETTINGS, AUDIENCE, defaultSurfaces } from "./constants.js";

/** Redraw the left-hand toolbar so surface buttons match reality. */
function refreshControls() {
  if (ui.controls?.rendered) ui.controls.render();
}

export function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, data);

  register(SETTINGS.HOP_ENABLED, {
    name: "VELVETMOVE.settings.hopEnabled.name",
    hint: "VELVETMOVE.settings.hopEnabled.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshControls
  });

  register(SETTINGS.HOP_HEIGHT, {
    name: "VELVETMOVE.settings.hopHeight.name",
    hint: "VELVETMOVE.settings.hopHeight.hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 0.6, step: 0.01 },
    default: 0.16
  });

  register(SETTINGS.STEP_LENGTH, {
    name: "VELVETMOVE.settings.stepLength.name",
    hint: "VELVETMOVE.settings.stepLength.hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.25, max: 3, step: 0.05 },
    default: 1
  });

  register(SETTINGS.IGNORE_ELEVATED, {
    name: "VELVETMOVE.settings.ignoreElevated.name",
    hint: "VELVETMOVE.settings.ignoreElevated.hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  register(SETTINGS.SOUND_ENABLED, {
    name: "VELVETMOVE.settings.soundEnabled.name",
    hint: "VELVETMOVE.settings.soundEnabled.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshControls
  });

  register(SETTINGS.MASTER_VOLUME, {
    name: "VELVETMOVE.settings.masterVolume.name",
    hint: "VELVETMOVE.settings.masterVolume.hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.6
  });

  register(SETTINGS.AUDIENCE, {
    name: "VELVETMOVE.settings.audience.name",
    hint: "VELVETMOVE.settings.audience.hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [AUDIENCE.ALL]: "VELVETMOVE.settings.audience.all",
      [AUDIENCE.OWNED]: "VELVETMOVE.settings.audience.owned",
      [AUDIENCE.CONTROLLED]: "VELVETMOVE.settings.audience.controlled"
    },
    default: AUDIENCE.ALL
  });

  register(SETTINGS.PITCH_VARIATION, {
    name: "VELVETMOVE.settings.pitchVariation.name",
    hint: "VELVETMOVE.settings.pitchVariation.hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 0.4, step: 0.01 },
    default: 0.12
  });

  // The surface library and the fallback floor live off the settings sheet:
  // both are edited from the quick menu, where a file picker makes sense.
  register(SETTINGS.SURFACES, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultSurfaces(),
    onChange: refreshControls
  });

  register(SETTINGS.DEFAULT_SURFACE, {
    scope: "world",
    config: false,
    type: String,
    default: "stone",
    onChange: refreshControls
  });

  // Lo escribe el cliente del GM tras verificar Patreon y lo leen los demás,
  // para que ningún jugador contacte con el servidor de licencias.
  // `config: false` a propósito: no es un interruptor, es un hecho.
  // La entrada de menú la registra la capa `license` desde main.js.
  register(SETTINGS.WORLD_LICENSED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
}

/** Typed, guarded reads. A setting requested before `init` must not throw. */
export const Settings = {
  get(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch {
      return fallback;
    }
  },

  async set(key, value) {
    return game.settings.set(MODULE_ID, key, value);
  },

  get hopEnabled() { return this.get(SETTINGS.HOP_ENABLED, true) !== false; },
  get hopHeight() { return Number(this.get(SETTINGS.HOP_HEIGHT, 0.16)) || 0; },
  get stepLength() { return Math.max(0.05, Number(this.get(SETTINGS.STEP_LENGTH, 1)) || 1); },
  get ignoreElevated() { return this.get(SETTINGS.IGNORE_ELEVATED, true) !== false; },
  get soundEnabled() { return this.get(SETTINGS.SOUND_ENABLED, true) !== false; },
  get masterVolume() { return Math.clamp(Number(this.get(SETTINGS.MASTER_VOLUME, 0.6)) || 0, 0, 1); },
  get audience() { return this.get(SETTINGS.AUDIENCE, AUDIENCE.ALL); },
  get pitchVariation() { return Math.clamp(Number(this.get(SETTINGS.PITCH_VARIATION, 0.12)) || 0, 0, 0.4); }
};
