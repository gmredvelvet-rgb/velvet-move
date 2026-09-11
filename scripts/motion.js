/**
 * Velvet Move — the hop.
 *
 * The bounce is driven by *distance travelled*, not by a timer. Each token
 * carries a step phase that advances with the ground it covers, and the lift
 * is `sin(π · phase)`: the token leaves the floor as it sets off, peaks
 * mid-cell, and is back down exactly as it arrives — at whatever speed the
 * system, the movement action or a dragged path happens to move it. A footstep
 * plays on every landing, which is the same instant the phase crosses a whole
 * number. Slow walk, hasted sprint, ten-cell drag: the cadence follows.
 *
 * This module owns the *timing*: how far a token has walked, when a stride
 * lands, how high it should be right now. Where "up" is and what object to
 * move is the renderer's business — see `renderers.js`, which answers that
 * for top-down, Isometric Perspective and 3D Canvas alike. The renderer is
 * re-resolved every frame, so toggling 3D Canvas mid-session, or walking onto
 * an isometric scene, needs no reload and no bookkeeping here.
 *
 * @module motion
 */

import { MODULE_ID, LAND_MS, TELEPORT_CELLS, RENDERERS } from "./constants.js";
import { Settings } from "./settings.js";
import { activeRenderer, getPainter, isPixiRenderer } from "./renderers.js";
import { playFootstep } from "./audio.js";

/**
 * @typedef {object} MotionState
 * @property {number} x        Last seen animated position.
 * @property {number} y
 * @property {number} phase    Steps taken since this walk began.
 * @property {number} lift     Current height, in screen pixels.
 * @property {boolean} moving
 * @property {?{from: number, start: number}} settle  An interrupted stride.
 * @property {string} renderer  Which painter currently owns this token.
 * @property {object} paint     The painter's private bookkeeping.
 */

/** @type {Map<string, MotionState>} */
const states = new Map();

let running = false;

/**
 * Put the hop's current height onto whatever this renderer draws.
 *
 * Idempotent by construction — call it from the ticker and from the refresh
 * hook in the same frame and the result is identical.
 *
 * @param {Token} token
 * @param {MotionState} state
 */
function paint(token, state) {
  getPainter(state.renderer).paint(token, state.paint, state.lift);
}

/**
 * Put a token back on the floor and forget the offset.
 * @param {Token} token
 * @param {MotionState} state
 */
function settleDown(token, state) {
  getPainter(state.renderer).clear(token, state.paint);
  state.lift = 0;
}

/**
 * Hand a token over to a different painter, floor-first.
 *
 * A token mid-hop when the canvas switches from 2D to 3D would otherwise keep
 * a PIXI offset nobody will ever take back off.
 *
 * @param {Token} token
 * @param {MotionState} state
 * @param {string} renderer
 */
function retarget(token, state, renderer) {
  if (state.renderer === renderer) return;
  getPainter(state.renderer).clear(token, state.paint);
  state.renderer = renderer;
  state.paint = {};
}

/**
 * Whether a token takes part at all. Preview clones are the drag ghost — the
 * real token is still standing where it was, and hopping the ghost would put
 * two of it on the board.
 * @param {Token} token
 * @returns {boolean}
 */
function tracked(token, renderer) {
  if (!token?.document || token.isPreview) return false;

  /* "Ignore elevated tokens" means "do not make a flying creature clomp".
     In 3D Canvas elevation is also how every upper floor is expressed, so
     applying it there would silence a whole tavern's first storey. */
  if (renderer !== RENDERERS.THREE
    && Settings.ignoreElevated
    && (Number(token.document.elevation) || 0) > 0) return false;

  return true;
}

/**
 * Advance one token by one frame.
 * @param {Token} token
 * @param {number} now      performance.now()
 * @param {number} gridSize
 */
function step(token, now, gridSize, renderer) {
  const id = token.document.id;
  const state = states.get(id);

  if (!tracked(token, renderer)) {
    if (state) {
      settleDown(token, state);
      states.delete(id);
    }
    return;
  }

  // `document.x/y` is what the core animates during a move; `_source.x/y`
  // stays on the database value. Reading the animated pair is what keeps the
  // bounce glued to the slide.
  const x = token.document.x;
  const y = token.document.y;

  if (!state) {
    states.set(id, {
      x, y, phase: 0, lift: 0, moving: false, settle: null, lastStep: 0,
      renderer, paint: {}
    });
    return;
  }

  // A canvas that switched between 2D, isometric and 3D hands the token to a
  // different painter; the outgoing one puts it down before letting go.
  retarget(token, state, renderer);

  const dx = x - state.x;
  const dy = y - state.y;
  state.x = x;
  state.y = y;

  const distance = Math.hypot(dx, dy);
  const maxLift = gridSize * Settings.hopHeight;
  const strideLength = Math.max(1, gridSize * Settings.stepLength);

  if (distance > 0) {
    state.settle = null;

    if (distance > gridSize * TELEPORT_CELLS) {
      // A teleport, a scene-load reposition, or a GM dragging someone across
      // the map. There were no strides, so there is nothing to sound out.
      state.phase = 0;
      state.lift = 0;
      state.moving = false;
      settleDown(token, state);
      return;
    }

    const before = state.phase;
    state.phase += distance / strideLength;
    state.moving = true;

    if (Math.floor(state.phase) > Math.floor(before)) {
      state.lastStep = now;
      playFootstep(token);
    }

    const fraction = state.phase - Math.floor(state.phase);
    state.lift = Settings.hopEnabled ? maxLift * Math.sin(Math.PI * fraction) : 0;
    paint(token, state);
    return;
  }

  if (state.moving) halt(token, state, now);
  if (state.settle) descend(token, state, now);
}

/**
 * The token stopped moving this frame.
 *
 * If it stopped between strides it still has to come down, and that landing
 * deserves its footstep — a walk of two-and-a-bit cells must not end in
 * silence just because the phase never quite reached the next whole number.
 *
 * @param {Token} token
 * @param {MotionState} state
 * @param {number} now
 */
function halt(token, state, now) {
  state.moving = false;
  state.settle = state.lift > 0.5 ? { from: state.lift, start: now } : null;

  /* Sound the landing only if the token really was mid-stride. Stopping a
     hair after a stride completed has already been sounded, and a second
     footstep on top of that reads as a stumble. */
  const remainder = state.phase - Math.floor(state.phase);
  if (remainder > 0.2 && (now - (state.lastStep ?? 0)) > LAND_MS) {
    state.lastStep = now;
    playFootstep(token);
  }

  if (!state.settle) {
    state.phase = 0;
    state.lift = 0;
    settleDown(token, state);
  }
}

/**
 * Ease an interrupted stride back onto the floor.
 * @param {Token} token
 * @param {MotionState} state
 * @param {number} now
 */
function descend(token, state, now) {
  const t = Math.min(1, (now - state.settle.start) / LAND_MS);
  // Fast off the top, gentle onto the floor.
  state.lift = state.settle.from * (1 - t) * (1 - t);
  if (t >= 1) {
    state.settle = null;
    state.phase = 0;
    state.lift = 0;
  }
  paint(token, state);
  if (!state.lift) settleDown(token, state);
}

export const Motion = {
  /** Whether any token is currently off the ground. */
  get busy() {
    for (const state of states.values()) if (state.lift) return true;
    return false;
  },

  /** One frame for every token on the canvas. */
  onTick() {
    if (!canvas?.ready || !canvas.tokens?.placeables?.length) return;
    const gridSize = canvas.grid?.size || canvas.scene?.grid?.size || 100;
    const now = performance.now();
    // Resolved once per frame rather than per token: it is the same answer
    // for all of them, and it costs a settings read plus two module checks.
    const renderer = activeRenderer();
    for (const token of canvas.tokens.placeables) {
      try {
        step(token, now, gridSize, renderer);
      } catch (err) {
        // One bad token — mid-teardown, mid-redraw — must not stop the rest
        // of the table from walking.
        console.warn(`${MODULE_ID} | Motion frame failed for a token`, err);
        states.delete(token?.document?.id);
      }
    }
  },

  /**
   * Re-apply the offset after something else has rewritten the token mesh.
   *
   * Registered on `refreshToken` during `ready`, which puts it behind
   * Isometric Perspective's own handler — the one that recomputes the mesh
   * position from the document. We get the last word on the frame.
   *
   * Only the PIXI renderers care: 3D Canvas does not rebuild its models from
   * this hook, and its painter would just do redundant work.
   *
   * @param {Token} token
   */
  onRefresh(token) {
    const state = states.get(token?.document?.id);
    if (!state?.lift || !isPixiRenderer(state.renderer)) return;
    try {
      paint(token, state);
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not re-apply the hop after a refresh`, err);
    }
  },

  /**
   * Start tracking. Safe to call twice, and a no-op in a world running
   * without a canvas — there is nothing to hop.
   */
  activate() {
    if (running) return;
    if (!canvas?.app?.ticker) return;
    running = true;
    Hooks.on("refreshToken", Motion.onRefresh);
    /* NORMAL, not LOW: PIXI.Application registers its own render at LOW, and
       a listener added at the same priority would run after it — painting the
       hop a frame late, every frame. */
    canvas.app.ticker.add(Motion.onTick, Motion, PIXI.UPDATE_PRIORITY.NORMAL);
  },

  /**
   * Stop tracking one token — it was deleted, or it left the scene.
   * @param {string} id
   */
  forget(id) {
    states.delete(id);
  },

  /** Drop every token back to the floor and forget the scene. */
  reset() {
    for (const [id, state] of states) {
      const token = canvas?.tokens?.get(id);
      if (token) settleDown(token, state);
    }
    states.clear();
  }
};
