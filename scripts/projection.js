/**
 * Velvet Move — "which way is up?".
 *
 * A token mesh lives in stage coordinates, and Isometric Perspective rotates
 * and skews the stage. Lifting a token by subtracting from `mesh.position.y`
 * would therefore send it diagonally across the floor, not into the air.
 *
 * Rather than hard-coding the True Isometric angles — the module ships seven
 * projections and a custom one — we invert the stage's own linear transform.
 * Whatever projection is active, and whether or not the isometric module is
 * even installed, `liftVector` answers with the stage-space vector that reads
 * as straight up on screen.
 *
 * @module projection
 */

import { ISO_ID } from "./constants.js";

/**
 * The stage-space vector that displaces a mesh `lift` pixels up the screen.
 *
 * PIXI composes a transform as
 *   a = cos(rotation + skewY) · scaleX     c = -sin(rotation - skewX) · scaleY
 *   b = sin(rotation + skewY) · scaleX     d =  cos(rotation - skewX) · scaleY
 * and we want v such that M·v = (0, -lift). Scale is left out on purpose: the
 * hop is measured in stage pixels, so it zooms with the rest of the canvas.
 *
 * @param {number} lift  Screen-space height, in stage pixels.
 * @returns {{x: number, y: number}}
 */
export function liftVector(lift) {
  const stage = canvas?.app?.stage;
  if (!stage) return { x: 0, y: -lift };

  const rotation = stage.rotation ?? 0;
  const skewX = stage.skew?.x ?? 0;
  const skewY = stage.skew?.y ?? 0;

  // A stage nobody has touched is the common case and needs no algebra.
  if (!rotation && !skewX && !skewY) return { x: 0, y: -lift };

  const a = Math.cos(rotation + skewY);
  const b = Math.sin(rotation + skewY);
  const c = -Math.sin(rotation - skewX);
  const d = Math.cos(rotation - skewX);

  const det = (a * d) - (b * c);
  // A degenerate transform has no inverse; the canvas is unreadable anyway,
  // so fall back to screen-up rather than dividing by zero.
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return { x: 0, y: -lift };

  return {
    x: (c * lift) / det,
    y: (-a * lift) / det
  };
}

/**
 * Whether Isometric Perspective is projecting this scene.
 * Only used for reporting and for the odd cosmetic decision — the hop itself
 * derives everything from the live stage transform.
 * @param {Scene} [scene]
 * @returns {boolean}
 */
export function isIsometricScene(scene = canvas?.scene) {
  if (!game.modules.get(ISO_ID)?.active) return false;
  try {
    if (!game.settings.get(ISO_ID, "worldIsometricFlag")) return false;
  } catch {
    return false;
  }
  return !!scene?.getFlag(ISO_ID, "isometricEnabled");
}
