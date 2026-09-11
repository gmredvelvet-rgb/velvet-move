/**
 * Execute the module's `getSceneControlButtons` hook against stubbed Foundry
 * globals and assert the invariants SceneControls really enforces.
 *
 * Every rule here was read out of `client/applications/ui/scene-controls.mjs`
 * and every one has already cost a debugging session, because breaking them
 * surfaces as "every click throws" rather than as an error anywhere near the
 * mistake:
 *
 * 1. `activeTool` must name a tool that exists. `ui.controls.tool` is
 *    `this.tools[this.#tools[this.#control]]`, and `InteractionLayer#activate`
 *    reads `ui.controls.tool.name` — undefined there throws for anyone
 *    activating a layer while our group is selected.
 * 2. The active tool can never be clicked: `#onChangeTool` opens with
 *    `if ( tool === this.tool ) return;`. So it must not be a button or a
 *    toggle, or that control is dead.
 * 3. A tool may not be both toggle and button — Foundry warns and silently
 *    unsets `button`.
 * 4. `#onChange` calls `onChange` *and* the deprecated `onClick`, so defining
 *    both fires the handler twice for one click.
 * 5. The group's own `onChange` must not activate a canvas layer.
 *    `InteractionLayer#activate` reassigns `ui.controls.control` when the
 *    layer differs, leaving the record pointing at one group while the
 *    toolbar still shows another's buttons.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function checkSceneControls() {
  const problems = [];
  const hooks = {};

  globalThis.Hooks = {
    on(name, fn) { (hooks[name] ??= []).push(fn); },
    once(name, fn) { (hooks[name] ??= []).push(fn); },
    callAll() {}
  };

  globalThis.game = {
    user: { isGM: true, can: () => true },
    i18n: {
      localize: key => String(key).split(".").pop(),
      format: key => String(key).split(".").pop()
    },
    settings: {
      register() {},
      get(namespace, key) {
        if (key === "surfaces") {
          return {
            stone: { id: "stone", label: "Stone", icon: "fa-solid fa-mountain", sounds: [], volume: 1 },
            wood: { id: "wood", label: "Wood", icon: "fa-solid fa-tree", sounds: [], volume: 1 }
          };
        }
        if (key === "defaultSurface") return "stone";
        if (key === "renderer") return "auto";
        return undefined;
      },
      set: () => Promise.resolve()
    },
    modules: { get: () => ({ active: false }) },
    world: { id: "test" }
  };

  globalThis.ui = {
    controls: { rendered: false },
    notifications: { warn() {}, error() {}, info() {} }
  };

  globalThis.canvas = {
    scene: null,
    tokens: {
      activate() {
        problems.push("the group's onChange activates a canvas layer, which reassigns "
          + "ui.controls.control and detaches the toolbar from its record");
      }
    }
  };

  globalThis.foundry = {
    applications: {
      api: { ApplicationV2: class {}, HandlebarsApplicationMixin: base => base, DialogV2: class {} },
      apps: {},
      instances: new Map()
    },
    utils: { escapeHTML: text => text },
    audio: { AudioHelper: { play() {} } },
    data: { fields: {} }
  };

  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  Math.clamp ??= (value, min, max) => Math.min(Math.max(value, min), max);

  const { registerControls } = await import(pathToFileURL(path.join(root, "scripts/controls.js")).href);
  registerControls();

  const registered = hooks.getSceneControlButtons ?? [];
  if (!registered.length) return ["registerControls did not register getSceneControlButtons"];

  const controls = {};
  for (const fn of registered) fn(controls);

  const group = controls["velvet-move"];
  if (!group) return ["no velvet-move control group was added"];

  const tools = group.tools ?? {};

  if (!group.activeTool) problems.push("the group has no activeTool, so ui.controls.tool is undefined");
  else if (!tools[group.activeTool]) problems.push(`activeTool "${group.activeTool}" is not one of the group's tools`);

  const active = tools[group.activeTool];
  if (active?.button) problems.push(`activeTool "${group.activeTool}" is a button and can never be clicked`);
  if (active?.toggle) problems.push(`activeTool "${group.activeTool}" is a toggle and can never be clicked`);

  for (const [name, tool] of Object.entries(tools)) {
    if (tool.toggle && tool.button) problems.push(`tool "${name}" is both toggle and button`);
    if (tool.onChange && tool.onClick) problems.push(`tool "${name}" defines onChange and onClick; both fire on one click`);
    if (tool.name !== name) problems.push(`tool keyed "${name}" carries the name "${tool.name}"`);
    if (!tool.title) problems.push(`tool "${name}" has no title`);
  }

  group.onChange?.(new Event("change"), true);

  return problems;
}
