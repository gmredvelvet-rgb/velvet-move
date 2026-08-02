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
import { getSurfaces, surfaceLabel, getSceneSurfaceId, setSceneSurfaceId } from "./surfaces.js";
import { VelvetMoveMenu } from "./apps/menu.js";

/** The single menu instance, so the button toggles rather than stacks. */
let menu = null;

function openMenu() {
  if (menu?.rendered) {
    menu.close();
    menu = null;
    return;
  }
  menu = new VelvetMoveMenu();
  menu.render(true);
}

/**
 * Build our tools. Shared by both toolbar shapes so the two branches below
 * cannot drift apart.
 * @returns {object[]}
 */
function buildTools() {
  const isGM = game.user.isGM;
  const activeId = getSceneSurfaceId();
  const tools = [];

  tools.push({
    name: "hop",
    title: game.i18n.localize("VELVETMOVE.controls.hop"),
    icon: "fa-solid fa-person-running",
    toggle: true,
    active: Settings.hopEnabled,
    onChange: (event, active) => Settings.set(SETTINGS.HOP_ENABLED, active),
    onClick: active => Settings.set(SETTINGS.HOP_ENABLED, active)
  });

  tools.push({
    name: "sound",
    title: game.i18n.localize("VELVETMOVE.controls.sound"),
    icon: "fa-solid fa-volume-high",
    toggle: true,
    active: Settings.soundEnabled,
    onChange: (event, active) => Settings.set(SETTINGS.SOUND_ENABLED, active),
    onClick: active => Settings.set(SETTINGS.SOUND_ENABLED, active)
  });

  // The floors themselves: one click to change what the whole scene sounds
  // like. World state, so only the GM gets to push them.
  if (isGM) {
    for (const surface of Object.values(getSurfaces())) {
      tools.push({
        name: `surface-${surface.id}`,
        title: game.i18n.format("VELVETMOVE.controls.surface", { name: surfaceLabel(surface) }),
        icon: surface.icon || "fa-solid fa-shoe-prints",
        toggle: true,
        active: surface.id === activeId,
        onChange: (event, active) => {
          if (active) void setSceneSurfaceId(surface.id);
          else if (ui.controls?.rendered) ui.controls.render();
        },
        onClick: () => setSceneSurfaceId(surface.id)
      });
    }
  }

  tools.push({
    name: "menu",
    title: game.i18n.localize("VELVETMOVE.controls.menu"),
    icon: "fa-solid fa-sliders",
    button: true,
    onChange: () => openMenu(),
    onClick: () => openMenu()
  });

  return tools;
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
        tools,
        activeTool: "menu"
      });
      return;
    }

    controls[MODULE_ID] = {
      name: MODULE_ID,
      title,
      icon,
      visible: true,
      order: Object.keys(controls).length + 1,
      // Selecting a control group normally swaps the active canvas layer.
      // Ours has nothing to draw, so give the tokens layer straight back.
      onChange: (event, active) => {
        if (active) canvas.tokens?.activate();
      },
      onToolChange: () => {},
      tools: Object.fromEntries(tools.map((tool, index) => [
        tool.name, { ...tool, order: index + 1 }
      ])),
      activeTool: "menu"
    };
  });
}
