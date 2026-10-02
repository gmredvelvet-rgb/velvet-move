import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultSurfaces } from "../scripts/constants.js";
import { registerTaleSpireFootsteps, onTaleSpireTokenUpdate, onTaleSpireMotion } from "../scripts/talespire-footsteps.js";
import { playFootstep } from "../scripts/audio.js";
import { registerSettings } from "../scripts/settings.js";
import { getSurfaces, getSceneSurfaceId, setSceneSurfaceId, setTokenSurfaceId } from "../scripts/surfaces.js";

const callbacks = new Map();
test("default surfaces include six bundled Ogg samples and independent editable arrays", () => {
  const surfaces = defaultSurfaces();
  for (const id of ["stone", "wood", "grass", "dirt", "gravel", "water"]) {
    assert.deepEqual(surfaces[id].sounds, [`modules/velvet-move/assets/footsteps/${id}.ogg`]);
    const bytes = readFileSync(new URL(`../assets/footsteps/${id}.ogg`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "OggS");
  }
  surfaces.stone.sounds.length = 0;
  assert.equal(defaultSurfaces().stone.sounds.length, 1);
  assert.deepEqual(surfaces.sand.sounds, []);
});
let clock = 1000;
function fixture(t) {
  for (const key of ["game", "canvas", "foundry", "Hooks", "performance", "setTimeout", "clearTimeout"]) {
    const previous = globalThis[key];
    t.after(() => { if (previous === undefined) delete globalThis[key]; else globalThis[key] = previous; });
  }
  const oldClamp = Math.clamp;
  Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  t.after(() => { if (oldClamp) Math.clamp = oldClamp; else delete Math.clamp; });
  const settings = new Map([
    ["talespireEcosystem", true], ["soundEnabled", true], ["audience", "all"],
    ["masterVolume", 0.6], ["stepLength", 1], ["pitchVariation", 0],
    ["defaultSurface", "stone"], ["surfaces", {
      stone: { id: "stone", sounds: ["stone.ogg"], volume: 1 },
      wood: { id: "wood", sounds: ["wood.ogg"], volume: 1 }
    }]
  ]);
  const scene = { grid: { size: 100 }, getFlag: () => "wood", tokens: { contents: [] } };
  const token = { uuid: "Scene.R.Token.A", id: "A", x: 0, y: 0, _source: { x: 0, y: 0 },
    parent: scene, actor: {}, isOwner: false, getFlag: () => null };
  scene.tokens.contents.push(token);
  const api = { links: {
    findCreatureByToken: doc => doc === token ? "mini" : null,
    findTokenByCreature: id => id === "mini" ? token : null
  }, selection: { minis: [], controlled: [] } };
  const played = [], timers = new Map();
  globalThis.canvas = null;
  globalThis.performance = { now: () => clock };
  globalThis.setTimeout = fn => { const id = Symbol(); timers.set(id, fn); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.Hooks = { on: (name, fn) => { const list = callbacks.get(name) ?? []; list.push(fn); callbacks.set(name, list); } };
  globalThis.game = { user: { isGM: false }, scenes: { contents: [scene] },
    modules: { get: id => id === "talespire-canvas-bridge" ? { active: true, api } : null },
    settings: { get: (_module, key) => settings.get(key) },
    i18n: { localize: key => key }
  };
  globalThis.foundry = { audio: { AudioHelper: { play: async (options, broadcast) => {
    played.push({ ...options, broadcast }); return null;
  } } } };
  registerTaleSpireFootsteps();
  for (const fn of callbacks.get("createToken") ?? []) fn(token);
  t.after(() => { for (const fn of callbacks.get("deleteToken") ?? []) fn(token); });
  const move = (x, options = { "talespire-canvas-bridge": { talespireSync: true } }) => {
    clock += 200;
    token._source.x = token.x = x;
    onTaleSpireTokenUpdate(token, { x }, options);
  };
  return { token, api, scene, settings, played, timers, move };
}
test("GM-synced movement sounds on a canvas-less player, resolves token scene floor, and does not broadcast", t => {
  const { move, played } = fixture(t);
  move(100);
  assert.equal(played.length, 1);
  assert.equal(played[0].src, "wood.ogg");
  assert.equal(played[0].broadcast, false);
  assert.ok(played[0].volume > 0);
});
test("bundled defaults play in new libraries without replacing saved custom or empty surfaces", t => {
  const { settings, move, played, scene } = fixture(t);
  settings.delete("surfaces");
  scene.getFlag = () => null;
  move(100);
  assert.equal(played[0].src, "modules/velvet-move/assets/footsteps/stone.ogg");
  settings.set("surfaces", { stone: { sounds: [], volume: 1 }, wood: { sounds: ["custom.ogg"] } });
  assert.deepEqual(getSurfaces().stone.sounds, []);
  assert.deepEqual(getSurfaces().wood.sounds, ["custom.ogg"]);
});
test("repeated positions and normal Foundry updates do not sound as TaleSpire events", t => {
  const { move, played } = fixture(t);
  move(100, {}); move(100); move(100);
  assert.equal(played.length, 0);
});
test("small moves accumulate a stride and teleports reset without a burst", t => {
  const { move, played } = fixture(t);
  move(25); move(50); move(75);
  assert.equal(played.length, 0);
  move(100);
  assert.equal(played.length, 1);
  move(1000);
  assert.equal(played.length, 1);
  move(1100);
  assert.equal(played.length, 2);
});
test("disabled ecosystem, missing bridge, sound mute and zero surface volume remain silent", t => {
  const { move, settings, played } = fixture(t);
  settings.set("talespireEcosystem", false); move(100);
  settings.set("talespireEcosystem", true); settings.set("soundEnabled", false); move(200);
  settings.set("soundEnabled", true); settings.get("surfaces").wood.volume = 0; move(300);
  game.modules.get = () => null; move(400);
  assert.equal(played.length, 0);
});
test("hidden and unowned tokens respect audience settings; GM can hear hidden movement", t => {
  const { move, settings, played, token } = fixture(t);
  token.hidden = true; move(100);
  assert.equal(played.length, 0);
  game.user.isGM = true; move(200);
  assert.equal(played.length, 1);
  game.user.isGM = false; token.hidden = false;
  settings.set("audience", "owned"); move(300);
  assert.equal(played.length, 1);
  token.isOwner = true; move(400);
  assert.equal(played.length, 2);
});
test("controlled audience uses TaleSpire selection rather than a PIXI token", t => {
  const { move, settings, played, api } = fixture(t);
  settings.set("audience", "controlled"); move(100);
  assert.equal(played.length, 0);
  api.selection.minis = [{ id: "mini" }]; move(200);
  assert.equal(played.length, 1);
});
test("native token animation does not duplicate a linked TaleSpire footstep", t => {
  const { move, token, played } = fixture(t);
  move(100);
  clock += 100;
  playFootstep({ document: token, visible: true });
  assert.equal(played.length, 1);
});
test("a later normal Foundry move still has its original canvas footsteps", t => {
  const { move, token, played } = fixture(t);
  move(100);
  move(200, {});
  clock += 100;
  playFootstep({ document: token, visible: true });
  assert.equal(played.length, 2);
});
test("queued footsteps are bounded and deleted tokens cancel them", t => {
  const { move, token, played, timers } = fixture(t);
  move(300);
  assert.equal(played.length, 1);
  assert.equal(timers.size, 2);
  for (const fn of callbacks.get("deleteToken")) fn(token);
  assert.equal(timers.size, 0);
});
test("setting changes cancel queued footsteps and reseed positions", t => {
  const { move, settings, played, timers } = fixture(t);
  move(300);
  settings.set("talespireEcosystem", false);
  for (const fn of callbacks.get("updateSetting")) fn({ key: "velvet-move.talespireEcosystem" });
  assert.equal(timers.size, 0);
  move(400);
  assert.equal(played.length, 1);
});
test("TaleSpire ecosystem is opt-in world configuration", t => {
  fixture(t);
  const registered = new Map();
  game.settings.register = (_module, key, options) => registered.set(key, options);
  registerSettings();
  const setting = registered.get("talespireEcosystem");
  assert.equal(setting.default, false);
  assert.equal(setting.scope, "world");
  assert.equal(setting.config, true);
});
test("the sound panel can select the runtime scene floor without a canvas", async t => {
  const { scene } = fixture(t);
  let floor = "wood";
  scene.getFlag = (module, key) => module === "talespire-canvas-bridge" && key === "runtimeScene" ? true : floor;
  scene.setFlag = async (_module, _key, value) => { floor = value; };
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => { delete globalThis.requestAnimationFrame; });
  game.user.isGM = true;
  assert.equal(getSceneSurfaceId(), "wood");
  await setSceneSurfaceId("stone");
  assert.equal(getSceneSurfaceId(), "stone");
});
test("token surface overrides are written to their parent scene without a canvas", async t => {
  const { token, scene } = fixture(t);
  let update;
  scene.updateEmbeddedDocuments = async (type, changes) => { update = { type, changes }; };
  await setTokenSurfaceId([token], "wood");
  assert.deepEqual(update, { type: "Token", changes: [{ _id: "A", "flags.velvet-move.surface": "wood" }] });
});

test("direct TaleSpire motion sounds even when Foundry rejects or clamps the token update", t => {
  const { token, played } = fixture(t);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: -100, y: 0 }, previous: { x: -200, y: 0 } });
  assert.equal(played.length, 1);
  assert.equal(token.x, 0);
  clock += 200;
  onTaleSpireTokenUpdate(token, { x: 0 }, { "talespire-canvas-bridge": { talespireSync: true } });
  assert.equal(played.length, 1);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: 0, y: 0 }, previous: { x: -100, y: 0 } });
  assert.equal(played.length, 2);
});
test("short and long same-board drags produce a bounded footstep instead of staying silent", t => {
  const { token, played, timers } = fixture(t);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: 10, y: 0 }, previous: { x: 0, y: 0 } });
  assert.equal(played.length, 1);
  clock += 2000;
  onTaleSpireMotion({ token, foundry: { x: 1010, y: 0 }, previous: { x: 10, y: 0 } });
  assert.equal(played.length, 2);
  assert.ok(timers.size <= 7);
});
test("direct board changes reseed silently and repeated motion is deduplicated", t => {
  const { token, played } = fixture(t);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: 100, y: 0 }, contextChanged: true });
  assert.equal(played.length, 0);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: 200, y: 0 }, previous: { x: 100, y: 0 } });
  assert.equal(played.length, 1);
  clock += 200;
  onTaleSpireMotion({ token, foundry: { x: 200, y: 0 }, previous: { x: 200, y: 0 } });
  assert.equal(played.length, 1);
});
