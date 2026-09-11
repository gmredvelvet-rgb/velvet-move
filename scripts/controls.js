/**
 * Velvet Move — left-hand toolbar.
 *
 * A control group of its own, holding the two toggles worth reaching for
 * mid-session (bounce, sound), one button per floor material, and the way in
 * to the full menu. Selecting the group hands the canvas straight back to the
 * token layer, so dropping in to change the floor never costs you your
 * selection.
 *
 * @module controls
 */

import { MODULE_ID, SETTINGS } from "./constants.js";
import { Settings } from "./settings.js";
import { refreshControls } from "./ui-refresh.js";
import { getSurfaces, surfaceLabel, getSceneSurfaceId, setSceneSurfaceId } from "./surfaces.js";
import { VelvetMoveMenu } from "./apps/menu.js";

/**
 * Open the menu, or close it if it is already up.
 *
 * Guarded twice over, because a second instance sharing the same element id
 * replaces the first one's DOM node and leaves that render positioning a
 * detached element — an uncaught error that aborts the render before its
 * listeners are attached. The registry lookup catches an already-open window;
 * `opening` catches the click that arrives while the first one is still
 * rendering.
 */
let opening = false;
let menu = null;

export function openMenu() {
  // The registry is authoritative; the local handle covers a core that does
  // not expose one, so the button still toggles rather than stacking windows.
  const existing = foundry.applications?.instances?.get("velvet-move-menu")
    ?? (menu?.rendered ? menu : null);
  if (existing) {
    existing.close();
    menu = null;
    return;
  }

  if (opening) return;
  opening = true;
  menu = new VelvetMoveMenu();
  Promise.resolve(menu.render(true))
    .catch(err => {
      menu = null;
      console.error(`${MODULE_ID} | could not open the menu`, err);
      ui.notifications.error(game.i18n.format("VELVETMOVE.error.action", {
        action: "menu",
        message: err?.message ?? String(err)
      }));
    })
    .finally(() => { opening = false; });
}

/**
 * Build our tools. Shared by both toolbar shapes so the two branches below
 * cannot drift apart.
 * @returns {object[]}
 */
function buildTools() {
  const isGM = game.user.isGM;
  const activeId = getSceneSurfaceId();

  /* Only `onChange` is set here. v13 invokes it for both toggles and buttons,
     and adding `onClick` alongside it fires the same handler twice on a single
     click — which, for the menu button, opened two windows over each other.
     The legacy array shape gets `onClick` grafted on below instead. */
  const surfaceTools = !isGM ? [] : Object.values(getSurfaces()).map(surface => ({
    name: `surface-${surface.id}`,
    title: game.i18n.format("VELVETMOVE.controls.surface", { name: surfaceLabel(surface) }),
    icon: surface.icon || "fa-solid fa-shoe-prints",
    toggle: true,
    active: surface.id === activeId,
    onChange: (event, active) => {
      // Clicking the active floor again would otherwise leave the scene with
      // no floor selected; redraw instead so it stays lit.
      if (active) void setSceneSurfaceId(surface.id);
      else refreshControls();
    }
  }));

  return [
    /* A resting tool, like the Select arrow every core control group has.
       It exists for two reasons, both structural rather than cosmetic:

       - `InteractionLayer#activate({tool})` reads `ui.controls.tool.name`.
         With no active tool that getter answers undefined, so any layer
         activation carrying a tool name would throw while our group is
         selected — a landmine for other modules and for macros.
       - `SceneControls#_onChangeTool` returns early when the clicked tool is
         already the active one. Parking that status on a tool nobody needs to
         press keeps every real control clickable. */
    {
      name: "select",
      title: game.i18n.localize("VELVETMOVE.controls.select"),
      icon: "fa-solid fa-arrow-pointer"
    },
    {
      name: "hop",
      title: game.i18n.localize("VELVETMOVE.controls.hop"),
      icon: "fa-solid fa-person-running",
      toggle: true,
      active: Settings.hopEnabled,
      onChange: (event, active) => void Settings.set(SETTINGS.HOP_ENABLED, active)
    },
    {
      name: "sound",
      title: game.i18n.localize("VELVETMOVE.controls.sound"),
      icon: "fa-solid fa-volume-high",
      toggle: true,
      active: Settings.soundEnabled,
      onChange: (event, active) => void Settings.set(SETTINGS.SOUND_ENABLED, active)
    },
    // The floors themselves: one click to change what the whole scene sounds
    // like. World state, so only the GM gets to push them.
    ...surfaceTools,
    {
      name: "menu",
      title: game.i18n.localize("VELVETMOVE.controls.menu"),
      icon: "fa-solid fa-sliders",
      button: true,
      onChange: () => openMenu()
    }
  ];
}

/** Register the toolbar hook. */
export function registerControls() {
  Hooks.on("getSceneControlButtons", controls => {
    const tools = buildTools();
    const title = game.i18n.localize("VELVETMOVE.controls.group");
    const icon = "fa-solid fa-shoe-prints";

    // v12 and earlier hand over an array of groups; v13 hands over a record
    // keyed by group name, with tools keyed the same way.
    if (Array.isArray(controls)) {
      controls.push({
        name: MODULE_ID,
        title,
        icon,
        layer: "tokens",
        visible: true,
        activeTool: "select",
        // v12 dispatches `onClick`, with the toggle's new state as its only
        // argument; v13 uses `onChange`. Bridging here keeps one definition.
        tools: tools.map(tool => ({
          ...tool,
          onClick: active => tool.onChange?.(null, active)
        }))
      });
      return;
    }

    controls[MODULE_ID] = {
      name: MODULE_ID,
      title,
      icon,
      visible: true,
      order: Object.keys(controls).length + 1,
      /* No `onChange` calling `canvas.tokens.activate()`. That looks like a
         courtesy — hand the canvas back so selecting this group costs you
         nothing — but `InteractionLayer#activate` reassigns
         `ui.controls.control` to the tokens group when the layer differs.
         The record then says "tokens" while the toolbar still shows these
         buttons, and every click here resolves to a tool the tokens group has
         never heard of: `undefined.button`, on each and every press.
         Selecting a package control group does not disturb the canvas layer
         on its own, so there is nothing to give back. */
      tools: Object.fromEntries(tools.map((tool, index) => [
        tool.name, { ...tool, order: index + 1 }
      ])),
      activeTool: "select"
    };
  });
}
