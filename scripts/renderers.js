/**
 * Velvet Move — where "up" is, for each way a scene can be drawn.
 *
 * Three renderers, and the hop means something different in each:
 *
 * - **2D** — a top-down scene. Up the screen is `-y` on the token mesh, and
 *   that is the whole of it.
 * - **Isometric** — Isometric Perspective rotates and skews the PIXI stage, so
 *   subtracting from `mesh.position.y` sends the token sliding diagonally
 *   across the floor instead of into the air. The stage's own linear transform
 *   is inverted to find the vector that reads as vertical on screen.
 * - **3D** — theripper93's 3D Canvas draws tokens as Three.js objects; the
 *   PIXI mesh is still there but invisible, so offsetting it does nothing at
 *   all. The lift belongs on the model's `y` in the 3D scene, whose units are
 *   canvas pixels divided by the module's factor.
 *
 * Each renderer is a *painter*: it applies a lift and can take it back off
 * again. All three share one discipline — before applying a new offset, check
 * whether the value on the object is still the exact one we last wrote. If it
 * is, peel it back to recover the clean base; if it is not, whoever overwrote
 * it has handed us a fresh base already. No offset is ever counted twice, so
 * a token cannot drift off the map however many frames go by.
 *
 * @module renderers
 */

import { RENDERERS, ISO_ID, CANVAS3D_ID, SETTINGS, THREE_FACTOR } from "./constants.js";
import { Settings } from "./settings.js";
import { liftVector, flatLiftVector } from "./projection.js";

/* -------------------------------------------- */
/*  Detection                                   */
/* -------------------------------------------- */

/**
 * Whether 3D Canvas is currently drawing this client's canvas.
 *
 * `_active` rather than a public getter because 3D Canvas has no public one —
 * this is the flag its own code tests everywhere. It is per client: one player
 * can be in 3D while the rest of the table is in 2D, which is exactly why the
 * renderer is resolved per client and per frame rather than once at startup.
 *
 * @returns {boolean}
 */
export function is3DActive() {
  if (!game.modules.get(CANVAS3D_ID)?.active) return false;
  return (game.Levels3DPreview ?? game.canvas3D)?._active === true;
}

/**
 * Whether Isometric Perspective is projecting this scene.
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

/**
 * What this client is actually looking at, ignoring any override.
 * @returns {string} One of {@link RENDERERS}, never "auto".
 */
export function detectRenderer() {
  if (is3DActive()) return RENDERERS.THREE;
  if (isIsometricScene()) return RENDERERS.ISOMETRIC;
  return RENDERERS.FLAT;
}

/**
 * The renderer the hop should be drawn for: the configured one, or whatever
 * the canvas is doing when the setting is left on automatic.
 * @returns {string}
 */
export function activeRenderer() {
  const forced = Settings.get(SETTINGS.RENDERER, RENDERERS.AUTO);
  if (forced && forced !== RENDERERS.AUTO && forced in PAINTERS) return forced;
  return detectRenderer();
}

/** The 3D scene's unit scale: canvas pixels per 3D unit. */
function factor3d() {
  const factor = Number((game.Levels3DPreview ?? game.canvas3D)?.factor);
  return Number.isFinite(factor) && factor > 0 ? factor : THREE_FACTOR;
}

/* -------------------------------------------- */
/*  Painters                                    */
/* -------------------------------------------- */

/**
 * A painter that offsets the PIXI token mesh.
 *
 * The offset must be applied *after* everything else that writes the mesh
 * position in a frame. In an isometric scene that means after Isometric
 * Perspective's `refreshToken` handler, which recomputes the position from the
 * document every time — which is also why animating `document.texture.scaleX`
 * (how this effect works in Velvet Mobile) is silently discarded there.
 *
 * @param {(lift: number) => {x: number, y: number}} vectorFor
 * @returns {object}
 */
function pixiPainter(vectorFor) {
  return {
    paint(token, bag, lift) {
      const position = token.mesh?.position;
      if (!position) return;

      // Exact equality is the right test: these are the very floats we wrote.
      if (bag.written && bag.base && position.x === bag.written.x && position.y === bag.written.y) {
        position.set(bag.base.x, bag.base.y);
      }
      bag.base = { x: position.x, y: position.y };

      if (!lift) {
        bag.written = null;
        return;
      }

      const offset = vectorFor(lift);
      const x = bag.base.x + offset.x;
      const y = bag.base.y + offset.y;
      position.set(x, y);
      bag.written = { x, y };
    },

    clear(token, bag) {
      const position = token?.mesh?.position;
      if (position && bag.written && bag.base
        && position.x === bag.written.x && position.y === bag.written.y) {
        position.set(bag.base.x, bag.base.y);
      }
      bag.written = null;
      bag.base = null;
    }
  };
}

/**
 * A painter that lifts the token's Three.js model in 3D Canvas.
 *
 * The offset goes on `model.position.y`, not on the token container's — 3D
 * Canvas rewrites the container's `y` on every `setPosition`, lerping from
 * whatever value it finds there, so an offset parked on it would be dragged
 * back down and smeared across the following frames. The model's position is
 * set once when the model is built and left alone afterwards, which makes it
 * the right place to hang a purely visual lift.
 */
const threePainter = {
  /** @returns {object|null} The 3D counterpart of a canvas token. */
  token3d(token) {
    return (game.Levels3DPreview ?? game.canvas3D)?.tokens?.[token?.document?.id] ?? null;
  },

  paint(token, bag, lift) {
    const token3d = this.token3d(token);
    const position = token3d?.model?.position;
    if (!position) return;

    // A prone token is lying down and 3D Canvas is animating that same
    // property to get it there. Fighting over it would look like a seizure.
    if (token3d.isProne || token3d.animateProne) {
      this.clear(token, bag);
      return;
    }

    if (bag.written !== null && bag.written !== undefined
      && bag.base !== null && bag.base !== undefined
      && position.y === bag.written) {
      position.y = bag.base;
    }
    bag.base = position.y;

    if (!lift) {
      bag.written = null;
      return;
    }

    // The lift arrives in canvas pixels; the 3D scene measures in pixels
    // divided by the module's factor.
    const y = bag.base + (lift / factor3d());
    position.y = y;
    bag.written = y;
  },

  clear(token, bag) {
    const position = this.token3d(token)?.model?.position;
    if (position && bag.written !== null && bag.written !== undefined
      && bag.base !== null && bag.base !== undefined
      && position.y === bag.written) {
      position.y = bag.base;
    }
    bag.written = null;
    bag.base = null;
  }
};

/** @type {Record<string, {paint: Function, clear: Function}>} */
const PAINTERS = {
  // Straight up the screen, whatever the stage is doing. Forcing this in an
  // isometric scene is what "2D" means as an explicit choice.
  [RENDERERS.FLAT]: pixiPainter(flatLiftVector),
  [RENDERERS.ISOMETRIC]: pixiPainter(liftVector),
  [RENDERERS.THREE]: threePainter
};

/**
 * The painter for a renderer.
 * @param {string} [name]  Defaults to the active renderer.
 * @returns {{paint: Function, clear: Function}}
 */
export function getPainter(name) {
  return PAINTERS[name] ?? PAINTERS[RENDERERS.FLAT];
}

/**
 * Whether a renderer draws through the PIXI canvas.
 * @param {string} name
 * @returns {boolean}
 */
export function isPixiRenderer(name) {
  return name === RENDERERS.FLAT || name === RENDERERS.ISOMETRIC;
}
