import test from "node:test";
import assert from "node:assert/strict";

const instances = new Map(), hooks = new Map();
let failConstructor = false, failRender = false, renders = 0, focused = 0, errors = [];
class App {
  constructor() {
    if (failConstructor) throw new Error("Constructor failed");
    this.rendered = false;
    instances.set("velvet-move-menu", this);
  }
  async render(options) {
    assert.equal(options.force, true);
    if (failRender) throw new Error("Render failed");
    this.rendered = true;
    renders++;
    return this;
  }
  async close() { this.rendered = false; instances.delete("velvet-move-menu"); }
  async maximize() {}
  bringToFront() { focused++; }
}
globalThis.foundry = { applications: { api: {
  ApplicationV2: App, HandlebarsApplicationMixin: base => base, DialogV2: {}
}, instances }, utils: {} };
globalThis.game = {
  user: { isGM: true }, modules: { get: () => null },
  settings: { get: (_module, key) => key === "surfaces" ? {} : undefined },
  i18n: { localize: key => key, format: (_key, args) => args.message ?? args.name }
};
globalThis.canvas = null;
globalThis.ui = { notifications: { error: message => errors.push(message) } };
globalThis.Hooks = { on(name, fn) { const group = hooks.get(name) ?? []; group.push(fn); hooks.set(name, group); } };
Math.clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const { openMenu, registerControls } = await import("../scripts/controls.js");
registerControls();

function reset(t) {
  renders = 0; focused = 0; errors = []; failConstructor = failRender = false;
  t.after(async () => {
    for (const app of [...instances.values()]) await app.close();
    failConstructor = failRender = false;
  });
}
test("selecting the sidebar group opens the panel and deselecting does not close it", async t => {
  reset(t);
  const controls = {};
  for (const fn of hooks.get("getSceneControlButtons")) fn(controls);
  controls["velvet-move"].onChange({}, true);
  await Promise.resolve();
  assert.equal(renders, 1);
  controls["velvet-move"].onChange({}, false);
  assert.equal(instances.get("velvet-move-menu").rendered, true);
});
test("clicking an already selected group opens or focuses the panel, never toggles it closed", async t => {
  reset(t);
  let listener, bindings = 0;
  const root = { addEventListener: (_name, fn) => { listener = fn; bindings++; } };
  for (const fn of hooks.get("renderSceneControls")) { fn({}, root); fn({}, root); }
  assert.equal(bindings, 1);
  listener({ target: { closest: () => ({}) } });
  await Promise.resolve();
  assert.equal(renders, 1);
  await openMenu({ toggle: false });
  assert.equal(renders, 1);
  assert.equal(focused, 1);
  assert.equal(instances.get("velvet-move-menu").rendered, true);
});
test("constructor errors are reported and a later click can recover", async t => {
  reset(t);
  failConstructor = true;
  await openMenu();
  assert.deepEqual(errors, ["Constructor failed"]);
  failConstructor = false;
  await openMenu();
  assert.equal(renders, 1);
});
test("render errors are reported without leaving the opener permanently locked", async t => {
  reset(t);
  failRender = true;
  await openMenu();
  assert.deepEqual(errors, ["Render failed"]);
  failRender = false;
  await openMenu();
  assert.equal(renders, 1);
});
test("the sliders button still toggles the panel closed", async t => {
  reset(t);
  await openMenu();
  assert.equal(renders, 1);
  await openMenu();
  assert.equal(instances.has("velvet-move-menu"), false);
});
