/**
 * Velvet Move — footsteps.
 *
 * Playback is local to each client. Nothing is broadcast: every client runs
 * the same movement tracker over the same animated positions, so each one
 * already knows when a step lands, and a socket would only add latency and a
 * second copy of every sound.
 *
 * @module audio
 */

import { MODULE_ID, AUDIENCE, MIN_STEP_INTERVAL } from "./constants.js";
import { Settings } from "./settings.js";
import { resolveSurface } from "./surfaces.js";

/** Last sample played per surface, so a walk does not repeat one file. */
const lastSample = new Map();

/** Guard against two tokens landing on the same frame and doubling up. */
let lastPlayed = 0;

/**
 * Choose the next sample for a surface: random, but never the one we just
 * used, which is what makes a handful of files sound like a gait.
 * @param {object} surface
 * @returns {string|null}
 */
function pickSample(surface) {
  const sounds = surface?.sounds ?? [];
  if (!sounds.length) return null;
  if (sounds.length === 1) return sounds[0];

  const previous = lastSample.get(surface.id);
  const pool = sounds.filter(sound => sound !== previous);
  const choice = pool[Math.floor(Math.random() * pool.length)] ?? sounds[0];
  lastSample.set(surface.id, choice);
  return choice;
}

/**
 * Whether this client should hear a given token's steps.
 * @param {Token} token
 * @returns {boolean}
 */
function audible(token) {
  switch (Settings.audience) {
    case AUDIENCE.CONTROLLED:
      return token.controlled;
    case AUDIENCE.OWNED:
      return token.document.isOwner;
    default:
      break;
  }

  // "Everyone" still means everyone you can see. A token behind a wall, or
  // one walking off the far side of a large map, should not be heard.
  if (!token.visible) return false;
  return onScreen(token);
}

/**
 * Is the token inside the viewport (with a cell of slack)?
 * @param {Token} token
 * @returns {boolean}
 */
function onScreen(token) {
  try {
    const screen = canvas.app.renderer.screen;
    const point = token.mesh?.getGlobalPosition?.();
    if (!point) return true;
    const margin = 200;
    return point.x >= -margin && point.y >= -margin
      && point.x <= screen.width + margin && point.y <= screen.height + margin;
  } catch {
    // If the renderer will not answer, err towards hearing the step.
    return true;
  }
}

/**
 * Play one footstep for a token.
 * @param {Token} token
 */
export function playFootstep(token) {
  if (!Settings.soundEnabled) return;
  if (!token?.document || token.isPreview) return;

  const now = performance.now();
  if (now - lastPlayed < MIN_STEP_INTERVAL) return;

  if (!audible(token)) return;

  const surface = resolveSurface(token);
  const src = pickSample(surface);
  if (!src) return;

  const jitter = 1 - (Math.random() * 0.18);
  const volume = Math.clamp(
    Settings.masterVolume * (Number(surface.volume) || 1) * jitter,
    0, 1
  );
  if (volume <= 0) return;

  lastPlayed = now;
  void play(src, volume);
}

/**
 * Hand a sample to the audio helper and, if this core exposes the source
 * node, detune it slightly. The pitch wobble is what stops six copies of one
 * sample from sounding like a metronome — but it is decoration, and a core
 * that keeps its audio graph private simply gets the sample unaltered.
 *
 * @param {string} src
 * @param {number} volume
 * @param {number} [variation]  Overrides the configured pitch variation.
 */
export async function play(src, volume, variation) {
  try {
    const sound = await foundry.audio.AudioHelper.play({
      src,
      volume,
      loop: false,
      autoplay: true
    }, false);

    const spread = variation ?? Settings.pitchVariation;
    if (spread > 0 && sound?.sourceNode?.playbackRate) {
      sound.sourceNode.playbackRate.value = 1 + ((Math.random() * 2 - 1) * spread);
    }
    return sound;
  } catch (err) {
    console.warn(`${MODULE_ID} | Footstep "${src}" refused to play`, err);
    return null;
  }
}

/**
 * Audition a surface from the configuration menu, at full attention: no
 * audience filtering, no throttle, no pitch wobble hiding a bad sample.
 * @param {object} surface
 */
export function previewSurface(surface) {
  const src = pickSample(surface);
  if (!src) {
    ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.noSounds"));
    return;
  }
  void play(src, Math.clamp(Settings.masterVolume * (Number(surface.volume) || 1), 0, 1), 0);
}
