import { MODULE_ID, SETTINGS, TELEPORT_CELLS } from "./constants.js";
import { Settings } from "./settings.js";
import { BRIDGE_ID, linkedCreature, setBridgeMotion } from "./talespire-context.js";
import { playFootstep } from "./audio.js";

const states = new Map();
let registered = false;

function position(doc, change = {}) {
  return {
    x: change.x ?? doc._source?.x ?? doc.x,
    y: change.y ?? doc._source?.y ?? doc.y
  };
}
function forget(uuid) {
  const state = states.get(uuid);
  if (state) for (const timer of state.timers) clearTimeout(timer);
  states.delete(uuid);
}
function seed(doc) {
  if (!doc?.uuid) return;
  forget(doc.uuid);
  setBridgeMotion(doc, false);
  states.set(doc.uuid, { ...position(doc), phase: 0, last: 0, timers: new Set() });
}
function reset() {
  for (const uuid of states.keys()) forget(uuid);
  for (const scene of game.scenes?.contents ?? []) {
    for (const doc of scene.tokens?.contents ?? []) seed(doc);
  }
}

export function onTaleSpireTokenUpdate(doc, change, options = {}) {
  if (!doc?.uuid) return;
  if (!("x" in change || "y" in change)) return;
  const synced = Boolean(options[BRIDGE_ID]?.talespireSync && linkedCreature(doc));
  const state = states.get(doc.uuid);
  if (synced && state?.direct && !options.velvetDirectMotion) return;
  setBridgeMotion(doc, synced);
  const next = position(doc, change);
  if (!state) { seed(doc); setBridgeMotion(doc, synced); return; }
  const distance = Math.hypot(next.x - state.x, next.y - state.y);
  state.x = next.x;
  state.y = next.y;
  const size = Number(doc.parent?.grid?.size);
  if (!synced
    || !Number.isFinite(distance) || !(size > 0)) {
    state.phase = 0;
    state.direct = false;
    return;
  }
  if ((!options.velvetDirectMotion && distance > size * TELEPORT_CELLS) || options.teleport) {
    seed(doc);
    const seeded = states.get(doc.uuid);
    seeded.x = next.x;
    seeded.y = next.y;
    seeded.direct = Boolean(options.velvetDirectMotion);
    setBridgeMotion(doc, true);
    return;
  }
  if (!distance) return;
  const now = performance.now();
  const starting = !state.last || now - state.last > 1500;
  if (starting) state.phase = 0;
  state.last = now;
  const before = state.phase;
  state.phase += distance / Math.max(1, size * Settings.stepLength);
  const steps = Math.min(8, Math.max(options.velvetDirectMotion && starting ? 1 : 0,
    Math.floor(state.phase) - Math.floor(before)));
  // Bound each burst; newer movement replaces queued samples rather than piling up.
  for (const timer of state.timers) clearTimeout(timer);
  state.timers.clear();
  const token = { document: doc, scene: doc.parent, isPreview: false };
  for (let index = 0; index < steps; index++) {
    if (!index) playFootstep(token, { talespire: true });
    else {
      const timer = setTimeout(() => {
        state.timers.delete(timer);
        if (Settings.talespireEcosystem) playFootstep(token, { talespire: true });
      }, index * 180);
      state.timers.add(timer);
    }
  }
}

export function onTaleSpireMotion(event) {
  const doc = event?.token;
  if (!doc?.uuid || !linkedCreature(doc) || !event.foundry) return;
  if (!states.has(doc.uuid)) seed(doc);
  const state = states.get(doc.uuid);
  const initialJump = !state.direct && !event.previous
    && Math.hypot(event.foundry.x - state.x, event.foundry.y - state.y) > doc.parent.grid.size * TELEPORT_CELLS;
  if (!state.direct && event.previous) {
    state.x = event.previous.x;
    state.y = event.previous.y;
  }
  state.direct = true;
  onTaleSpireTokenUpdate(doc, event.foundry, {
    [BRIDGE_ID]: { talespireSync: true },
    velvetDirectMotion: true,
    teleport: event.contextChanged || initialJump
  });
}

export function registerTaleSpireFootsteps() {
  if (registered) return;
  registered = true;
  reset();
  // Direct bridge motion works without canvas movement; token updates remain a fallback.
  Hooks.on("updateToken", onTaleSpireTokenUpdate);
  Hooks.on("talespireBridge.creatureMotion", onTaleSpireMotion);
  Hooks.on("createToken", seed);
  Hooks.on("deleteToken", doc => forget(doc.uuid));
  Hooks.on("deleteScene", scene => {
    for (const doc of scene.tokens?.contents ?? []) forget(doc.uuid);
  });
  Hooks.on("updateSetting", setting => {
    if (setting.key === `${MODULE_ID}.${SETTINGS.TALESPIRE_ECOSYSTEM}`) reset();
  });
}
