/**
 * Exercise the renderer layer for real: detection, the direction of the lift
 * in each projection, and the peel logic that keeps a token from drifting.
 *
 * The direction test is the one worth having. In an isometric scene the stage
 * is rotated and skewed, so "up" is not `-y`; the lift vector is derived by
 * inverting the stage's own linear transform, and the only honest way to check
 * that is to push the result back through PIXI's transform maths and confirm
 * it lands straight up the screen.
 */

import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** PIXI composes a transform this way; see Transform#updateLocalTransform. */
function toScreen(stage, vector) {
  const { rotation = 0, skew = { x: 0, y: 0 } } = stage;
  const a = Math.cos(rotation + skew.y);
  const b = Math.sin(rotation + skew.y);
  const c = -Math.sin(rotation - skew.x);
  const d = Math.cos(rotation - skew.x);
  return { x: (a * vector.x) + (c * vector.y), y: (b * vector.x) + (d * vector.y) };
}

function stubGlobals({ stage, iso = false, three = false, forced = "auto" } = {}) {
  globalThis.game = {
    modules: {
      get: id => ({
        active: (id === "isometric-perspective" && iso) || (id === "levels-3d-preview" && three)
      })
    },
    settings: {
      get(namespace, key) {
        if (namespace === "isometric-perspective" && key === "worldIsometricFlag") return iso;
        if (key === "renderer") return forced;
        return undefined;
      }
    },
    i18n: { localize: key => key, format: key => key }
  };
  globalThis.canvas = {
    app: { stage: stage ?? { rotation: 0, skew: { x: 0, y: 0 } } },
    scene: { getFlag: (id, key) => id === "isometric-perspective" && key === "isometricEnabled" && iso }
  };
  globalThis.ui = { controls: { rendered: false } };
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  globalThis.Levels3DPreviewStub = null;
  Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);
}

export async function checkRenderers() {
  const problems = [];
  const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) < tolerance;

  const module = await import(pathToFileURL(path.join(root, "scripts/renderers.js")).href);
  const projection = await import(pathToFileURL(path.join(root, "scripts/projection.js")).href);

  /* ---- 1. A plain stage lifts straight up ---- */
  stubGlobals();
  let v = projection.liftVector(20);
  if (!near(v.x, 0) || !near(v.y, -20)) {
    problems.push(`2D lift should be (0, -20), got (${v.x}, ${v.y})`);
  }

  /* ---- 2. True Isometric lifts straight up *on screen* ---- */
  const trueIso = {
    rotation: -30 * Math.PI / 180,
    skew: { x: 30 * Math.PI / 180, y: 0 }
  };
  stubGlobals({ stage: trueIso, iso: true });
  v = projection.liftVector(20);
  let screen = toScreen(trueIso, v);
  if (!near(screen.x, 0, 1e-9) || !near(screen.y, -20, 1e-9)) {
    problems.push(`isometric lift lands at screen (${screen.x}, ${screen.y}), expected (0, -20)`);
  }

  /* ---- 3. …and so does every other projection the module ships ---- */
  const projections = {
    "Dimetric (2:1)": { rotation: -45, skewX: 18.435, skewY: 18.435 },
    "Overhead": { rotation: -45, skewX: 9.735607, skewY: 9.735607 },
    "Diablo 1": { rotation: -30, skewX: 34, skewY: 4 },
    "Planescape": { rotation: -35, skewX: 20, skewY: 0 }
  };
  for (const [name, spec] of Object.entries(projections)) {
    const stage = {
      rotation: spec.rotation * Math.PI / 180,
      skew: { x: spec.skewX * Math.PI / 180, y: spec.skewY * Math.PI / 180 }
    };
    stubGlobals({ stage, iso: true });
    screen = toScreen(stage, projection.liftVector(20));
    if (!near(screen.x, 0, 1e-9) || !near(screen.y, -20, 1e-9)) {
      problems.push(`${name}: lift lands at screen (${screen.x}, ${screen.y}), expected (0, -20)`);
    }
  }

  /* ---- 4. Forcing 2D really does ignore the projection ---- */
  v = projection.flatLiftVector(20);
  if (!near(v.x, 0) || !near(v.y, -20)) problems.push("the forced 2D vector should ignore the stage entirely");

  /* ---- 5. Detection ---- */
  stubGlobals();
  if (module.detectRenderer() !== "2d") problems.push(`a plain canvas should detect "2d", got "${module.detectRenderer()}"`);

  stubGlobals({ stage: trueIso, iso: true });
  if (module.detectRenderer() !== "isometric") problems.push(`an isometric scene should detect "isometric", got "${module.detectRenderer()}"`);

  stubGlobals({ three: true });
  globalThis.game.Levels3DPreview = { _active: true, factor: 1000, tokens: {} };
  if (module.detectRenderer() !== "3d") problems.push(`3D Canvas active should detect "3d", got "${module.detectRenderer()}"`);

  // 3D wins over isometric: it is what the player is actually looking at.
  stubGlobals({ stage: trueIso, iso: true, three: true });
  globalThis.game.Levels3DPreview = { _active: true, factor: 1000, tokens: {} };
  if (module.detectRenderer() !== "3d") problems.push("3D Canvas should win over an isometric scene");

  // An override beats detection.
  stubGlobals({ forced: "2d", stage: trueIso, iso: true });
  if (module.activeRenderer() !== "2d") problems.push("a forced renderer should override detection");

  /* ---- 6. The peel: paint twice, clear once, land exactly where we started ---- */
  stubGlobals();
  const painter = module.getPainter("2d");
  const token = { mesh: { position: { x: 100, y: 200, set(x, y) { this.x = x; this.y = y; } } } };
  const bag = {};

  painter.paint(token, bag, 10);
  if (!near(token.mesh.position.y, 190)) problems.push(`one paint should lift to 190, got ${token.mesh.position.y}`);

  painter.paint(token, bag, 10);
  if (!near(token.mesh.position.y, 190)) problems.push(`painting twice must not double the lift; got ${token.mesh.position.y}`);

  painter.paint(token, bag, 5);
  if (!near(token.mesh.position.y, 195)) problems.push(`changing the lift should give 195, got ${token.mesh.position.y}`);

  painter.clear(token, bag);
  if (!near(token.mesh.position.y, 200)) problems.push(`clearing should restore 200, got ${token.mesh.position.y}`);

  // Someone else moving the mesh must be adopted as the new base, not fought.
  painter.paint(token, bag, 10);
  token.mesh.position.set(300, 400);
  painter.paint(token, bag, 10);
  if (!near(token.mesh.position.y, 390)) problems.push(`an outside write should become the new base; got ${token.mesh.position.y}`);
  painter.clear(token, bag);
  if (!near(token.mesh.position.y, 400)) problems.push(`clearing after an outside write should restore 400, got ${token.mesh.position.y}`);

  /* ---- 7. The 3D painter lifts the model, in 3D units ---- */
  stubGlobals({ three: true });
  const model = { position: { x: 0, y: 1.5, z: 0 } };
  globalThis.game.Levels3DPreview = { _active: true, factor: 1000, tokens: { t1: { model } } };
  const three = module.getPainter("3d");
  const token3d = { document: { id: "t1" } };
  const bag3d = {};

  three.paint(token3d, bag3d, 200);
  if (!near(model.position.y, 1.5 + 0.2)) problems.push(`3D lift of 200px should add 0.2 units, got ${model.position.y - 1.5}`);

  three.paint(token3d, bag3d, 200);
  if (!near(model.position.y, 1.5 + 0.2)) problems.push(`3D paint must be idempotent; got ${model.position.y}`);

  three.clear(token3d, bag3d);
  if (!near(model.position.y, 1.5)) problems.push(`3D clear should restore 1.5, got ${model.position.y}`);

  // A prone token is being animated by 3D Canvas itself; leave it alone.
  globalThis.game.Levels3DPreview.tokens.t1.isProne = true;
  three.paint(token3d, bag3d, 200);
  if (!near(model.position.y, 1.5)) problems.push("a prone token must not be lifted");

  return problems;
}
