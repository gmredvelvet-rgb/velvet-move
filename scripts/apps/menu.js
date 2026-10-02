/**
 * Velvet Move — the quick menu.
 *
 * One window: pick the floor the scene walks on, hang sound files off each
 * floor, tune the hop, and carry the whole setup to another world.
 *
 * Two rules govern the interaction model, both learned the hard way:
 *
 * - **Nothing fails silently.** Every action runs inside {@link guard}, so a
 *   button that cannot do its job says so instead of looking inert. The
 *   previous version returned quietly when the file picker could not be
 *   resolved, which is indistinguishable from a frozen window.
 * - **Typing does not re-render.** Text fields and sliders write through and
 *   patch the DOM in place; only structural changes (adding a sound, adding a
 *   surface, opening an editor) redraw. A re-render on every keystroke steals
 *   focus mid-word and reads as the window fighting you.
 *
 * @module apps/menu
 */

import { MODULE_ID, SETTINGS, SURFACE_FLAG, AUDIENCE, RENDERERS } from "../constants.js";
import { Settings } from "../settings.js";
import {
  getSurfaces, saveSurfaces, surfaceLabel, getSceneSurfaceId, setSceneSurfaceId,
  setTokenSurfaceId
} from "../surfaces.js";
import { previewSurface, play } from "../audio.js";
import { activeRenderer, detectRenderer } from "../renderers.js";
import * as Files from "../files.js";
import {
  serializeConfig, parseConfig, applyConfig,
  listPresets, savePreset, loadPreset, exportFileName, PRESET_FOLDER
} from "../config-io.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Strip a path down to something readable in a narrow list. */
function fileName(path) {
  try {
    return decodeURIComponent(String(path).split("?")[0].split("/").pop());
  } catch {
    return String(path);
  }
}

/** Escape text for interpolation into dialog markup. */
function escapeHtml(text) {
  if (foundry.utils.escapeHTML) return foundry.utils.escapeHTML(text);
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Wrap an action so a failure is reported rather than swallowed.
 * @param {string} name  Shown to the user if this action throws.
 * @param {Function} fn
 * @returns {Function}
 */
function guard(name, fn) {
  return async function guarded(event, target) {
    try {
      await fn.call(this, event, target);
    } catch (err) {
      console.error(`${MODULE_ID} | action "${name}" failed`, err);
      ui.notifications.error(game.i18n.format("VELVETMOVE.error.action", {
        action: name,
        message: err?.message ?? String(err)
      }));
    }
  };
}

/** Setting choices are keyed by name, not by their "2d"/"3d" values. */
const RENDERER_KEY = {
  [RENDERERS.AUTO]: "auto",
  [RENDERERS.FLAT]: "flat",
  [RENDERERS.ISOMETRIC]: "isometric",
  [RENDERERS.THREE]: "three"
};

/** GM-only guard for actions that write world state. */
function requireGM() {
  if (!game.user.isGM) throw new Error(game.i18n.localize("VELVETMOVE.notify.gmOnly"));
}

/* ============================================================ */
/*  Actions                                                     */
/* ============================================================ */

async function onActivate(event, target) {
  requireGM();
  await setSceneSurfaceId(target.dataset.surfaceId);
  await this.safeRender();
}

function onPreview(event, target) {
  const surface = getSurfaces()[target.dataset.surfaceId];
  if (surface) previewSurface(surface);
}

async function onToggleExpand(event, target) {
  const id = target.dataset.surfaceId;
  if (this.expanded.has(id)) this.expanded.delete(id);
  else this.expanded.add(id);
  await this.safeRender();
}

/**
 * Add one or more sound files to a surface.
 * @param {string} id
 * @param {string[]} paths
 */
async function addSounds(app, id, paths) {
  const surfaces = getSurfaces();
  const surface = surfaces[id];
  if (!surface) throw new Error(game.i18n.format("VELVETMOVE.error.noSuchSurface", { id }));

  const before = surface.sounds.length;
  surface.sounds = Array.from(new Set([...surface.sounds, ...paths]));
  const added = surface.sounds.length - before;

  await saveSurfaces(surfaces);
  app.expanded.add(id);
  await app.safeRender();

  if (added) ui.notifications.info(game.i18n.format("VELVETMOVE.notify.soundsAdded", { count: added }));
  else ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.alreadyThere"));
}

async function onAddFile(event, target) {
  requireGM();
  const id = target.dataset.surfaceId;
  const path = await Files.pick({ type: "audio", title: game.i18n.localize("VELVETMOVE.menu.addFile") });
  if (!path) return;
  await addSounds(this, id, [path]);
}

async function onAddFolder(event, target) {
  requireGM();
  const id = target.dataset.surfaceId;
  const folder = await Files.pick({ type: "folder", title: game.i18n.localize("VELVETMOVE.menu.addFolder") });
  if (!folder) return;

  const found = await Files.browseAudio(folder);
  if (!found.length) throw new Error(game.i18n.format("VELVETMOVE.error.emptyFolder", { folder }));
  await addSounds(this, id, found);
}

/**
 * The escape hatch: type or paste a path directly.
 *
 * Worth its own button even with a working picker — pasting a path from a
 * sound pack's README, or from another surface, beats clicking through six
 * folder levels.
 */
async function onAddPath(event, target) {
  requireGM();
  const id = target.dataset.surfaceId;
  const path = await DialogV2.prompt({
    window: { title: game.i18n.localize("VELVETMOVE.menu.addPath") },
    content: `<p>${game.i18n.localize("VELVETMOVE.menu.addPathHint")}</p>
      <input type="text" name="path" autofocus placeholder="sounds/steps/stone-01.ogg">`,
    ok: {
      label: game.i18n.localize("VELVETMOVE.menu.add"),
      callback: (ev, button) => button.form.elements.path.value?.trim()
    },
    rejectClose: false
  });
  if (!path) return;
  await addSounds(this, id, [path]);
}

function onPlaySound(event, target) {
  void play(target.dataset.path, Settings.masterVolume, 0);
}

async function onRemoveSound(event, target) {
  requireGM();
  const { surfaceId, index } = target.dataset;
  const surfaces = getSurfaces();
  const surface = surfaces[surfaceId];
  if (!surface) return;
  surface.sounds.splice(Number(index), 1);
  await saveSurfaces(surfaces);
  await this.safeRender();
}

async function onClearSounds(event, target) {
  requireGM();
  const id = target.dataset.surfaceId;
  const surfaces = getSurfaces();
  const surface = surfaces[id];
  if (!surface?.sounds.length) return;

  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("VELVETMOVE.menu.clearSounds") },
    content: `<p>${game.i18n.format("VELVETMOVE.menu.clearSoundsConfirm", {
      count: surface.sounds.length, name: surfaceLabel(surface)
    })}</p>`,
    rejectClose: false
  });
  if (!confirmed) return;

  surface.sounds = [];
  await saveSurfaces(surfaces);
  await this.safeRender();
}

async function onAddSurface() {
  requireGM();
  const name = await DialogV2.prompt({
    window: { title: game.i18n.localize("VELVETMOVE.menu.newSurface") },
    content: `<input type="text" name="label" autofocus placeholder="${game.i18n.localize("VELVETMOVE.menu.newSurfacePlaceholder")}">`,
    ok: {
      label: game.i18n.localize("VELVETMOVE.menu.create"),
      callback: (ev, button) => button.form.elements.label.value?.trim()
    },
    rejectClose: false
  });
  if (!name) return;

  const surfaces = getSurfaces();
  // Slugify, then de-duplicate: two surfaces sharing a key would silently
  // overwrite each other in the library.
  const base = name.slugify?.({ strict: true }) || name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "surface";
  let id = base;
  let n = 2;
  while (surfaces[id]) id = `${base}-${n++}`;

  surfaces[id] = { id, label: name, icon: "fa-solid fa-shoe-prints", sounds: [], volume: 1 };
  await saveSurfaces(surfaces);
  this.expanded.add(id);
  await this.safeRender();
}

async function onDeleteSurface(event, target) {
  requireGM();
  const id = target.dataset.surfaceId;
  const surfaces = getSurfaces();
  const surface = surfaces[id];
  if (!surface) return;

  if (Object.keys(surfaces).length <= 1) {
    throw new Error(game.i18n.localize("VELVETMOVE.notify.lastSurface"));
  }

  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.localize("VELVETMOVE.menu.deleteSurface") },
    content: `<p>${game.i18n.format("VELVETMOVE.menu.deleteConfirm", { name: surfaceLabel(surface) })}</p>`,
    rejectClose: false
  });
  if (!confirmed) return;

  delete surfaces[id];
  await saveSurfaces(surfaces);
  if (Settings.get(SETTINGS.DEFAULT_SURFACE) === id) {
    await Settings.set(SETTINGS.DEFAULT_SURFACE, Object.keys(surfaces)[0]);
  }
  this.expanded.delete(id);
  await this.safeRender();
}

async function onSetDefault(event, target) {
  requireGM();
  await Settings.set(SETTINGS.DEFAULT_SURFACE, target.dataset.surfaceId);
  ui.notifications.info(game.i18n.localize("VELVETMOVE.notify.defaultSet"));
  await this.safeRender();
}

async function onAssignTokens(event, target) {
  const selected = canvas?.tokens?.controlled ?? [];
  if (!selected.length) throw new Error(game.i18n.localize("VELVETMOVE.notify.noSelection"));
  await setTokenSurfaceId(selected.map(t => t.document), target.dataset.surfaceId);
  ui.notifications.info(game.i18n.format("VELVETMOVE.notify.assigned", { count: selected.length }));
  await this.safeRender();
}

async function onClearTokens() {
  const selected = (canvas?.tokens?.controlled ?? [])
    .filter(t => t.document.getFlag(MODULE_ID, SURFACE_FLAG));
  if (!selected.length) throw new Error(game.i18n.localize("VELVETMOVE.notify.noSelection"));
  await setTokenSurfaceId(selected.map(t => t.document), null);
  await this.safeRender();
}

/* ---- Save, export, import ---------------------------------- */

async function onSavePreset() {
  requireGM();
  const name = await DialogV2.prompt({
    window: { title: game.i18n.localize("VELVETMOVE.menu.savePreset") },
    content: `<p>${game.i18n.format("VELVETMOVE.menu.savePresetHint", { folder: PRESET_FOLDER })}</p>
      <input type="text" name="name" autofocus placeholder="${game.i18n.localize("VELVETMOVE.menu.presetPlaceholder")}">`,
    ok: {
      label: game.i18n.localize("VELVETMOVE.menu.save"),
      callback: (ev, button) => button.form.elements.name.value?.trim()
    },
    rejectClose: false
  });
  if (!name) return;

  const path = await savePreset(name);
  ui.notifications.info(game.i18n.format("VELVETMOVE.notify.presetSaved", { path }));
  await this.refreshPresets();
}

async function onLoadPreset() {
  requireGM();
  const select = this.element.querySelector('[data-preset-select]');
  const path = select?.value;
  if (!path) throw new Error(game.i18n.localize("VELVETMOVE.error.noPresetChosen"));

  const config = await loadPreset(path);
  await applyImportedConfig.call(this, config, fileName(path));
}

async function onRefreshPresets() {
  await this.refreshPresets();
  ui.notifications.info(game.i18n.localize("VELVETMOVE.notify.presetsRefreshed"));
}

function onExportFile() {
  Files.download(serializeConfig({ name: game.world?.title }), exportFileName());
  ui.notifications.info(game.i18n.localize("VELVETMOVE.notify.exported"));
}

async function onCopyJson() {
  const text = serializeConfig({ name: game.world?.title });
  try {
    await navigator.clipboard.writeText(text);
    ui.notifications.info(game.i18n.localize("VELVETMOVE.notify.copied"));
  } catch {
    // A browser that refuses clipboard access still deserves a way out, so
    // show the JSON and let the user copy it by hand.
    await DialogV2.prompt({
      window: { title: game.i18n.localize("VELVETMOVE.menu.exportJson") },
      content: `<textarea rows="16" style="width:100%; font-family:monospace;">${escapeHtml(text)}</textarea>`,
      ok: { label: game.i18n.localize("VELVETMOVE.menu.close") },
      rejectClose: false
    });
  }
}

async function onImportFile() {
  requireGM();
  const chosen = await Files.readLocalFile();
  if (!chosen) return;
  await applyImportedConfig.call(this, parseConfig(chosen.text), chosen.name);
}

async function onPasteJson() {
  requireGM();
  const text = await DialogV2.prompt({
    window: { title: game.i18n.localize("VELVETMOVE.menu.pasteJson") },
    content: `<p>${game.i18n.localize("VELVETMOVE.menu.pasteJsonHint")}</p>
      <textarea name="json" rows="12" autofocus style="width:100%; font-family:monospace;"></textarea>`,
    ok: {
      label: game.i18n.localize("VELVETMOVE.menu.import"),
      callback: (ev, button) => button.form.elements.json.value?.trim()
    },
    rejectClose: false
  });
  if (!text) return;
  await applyImportedConfig.call(this, parseConfig(text), game.i18n.localize("VELVETMOVE.menu.pasteJson"));
}

/**
 * Ask how an incoming configuration should land, then apply it.
 * @param {object} config
 * @param {string} label  What the user is importing, for the prompt.
 */
async function applyImportedConfig(config, label) {
  const count = Object.keys(config.surfaces).length;
  const mode = await DialogV2.wait({
    window: { title: game.i18n.localize("VELVETMOVE.menu.import") },
    content: `<p>${game.i18n.format("VELVETMOVE.menu.importPrompt", { label, count })}</p>
      <p class="notes">${game.i18n.localize("VELVETMOVE.menu.importModes")}</p>`,
    buttons: [
      { action: "merge", label: game.i18n.localize("VELVETMOVE.menu.importMerge"), icon: "fa-solid fa-code-merge", default: true },
      { action: "replace", label: game.i18n.localize("VELVETMOVE.menu.importReplace"), icon: "fa-solid fa-arrows-rotate" },
      { action: "cancel", label: game.i18n.localize("VELVETMOVE.menu.cancel"), icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!mode || mode === "cancel") return;

  const result = await applyConfig(config, { mode, withSettings: true });
  ui.notifications.info(game.i18n.format("VELVETMOVE.notify.imported", {
    total: result.surfaces,
    added: result.added
  }));
  await this.safeRender();
}

/* ============================================================ */
/*  The application                                             */
/* ============================================================ */

export class VelvetMoveMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "velvet-move-menu",
    tag: "div",
    classes: ["velvet-move", "velvet-move-menu"],
    window: {
      title: "VELVETMOVE.menu.title",
      icon: "fa-solid fa-shoe-prints",
      resizable: true
    },
    position: { width: 540, height: 720 },
    actions: {
      activate: guard("activate", onActivate),
      preview: guard("preview", onPreview),
      toggleExpand: guard("toggleExpand", onToggleExpand),
      addFile: guard("addFile", onAddFile),
      addFolder: guard("addFolder", onAddFolder),
      addPath: guard("addPath", onAddPath),
      playSound: guard("playSound", onPlaySound),
      removeSound: guard("removeSound", onRemoveSound),
      clearSounds: guard("clearSounds", onClearSounds),
      addSurface: guard("addSurface", onAddSurface),
      deleteSurface: guard("deleteSurface", onDeleteSurface),
      setDefault: guard("setDefault", onSetDefault),
      assignTokens: guard("assignTokens", onAssignTokens),
      clearTokens: guard("clearTokens", onClearTokens),
      savePreset: guard("savePreset", onSavePreset),
      loadPreset: guard("loadPreset", onLoadPreset),
      refreshPresets: guard("refreshPresets", onRefreshPresets),
      exportFile: guard("exportFile", onExportFile),
      copyJson: guard("copyJson", onCopyJson),
      importFile: guard("importFile", onImportFile),
      pasteJson: guard("pasteJson", onPasteJson)
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/menu.hbs`,
      // "" means the part root itself, which is this template's
      // .vmove-menu — querying for it by class would find nothing, and
      // the scroll position would jump to the top on every redraw.
      scrollable: [""]
    }
  };

  /** Surface ids whose editor is open. Survives re-renders. */
  expanded = new Set();

  /** Presets found on the server. Loaded once, refreshed on demand. */
  presets = [];

  #presetsLoaded = false;

  /**
   * Redraw, but only if this window is actually on screen.
   *
   * ApplicationV2 measures `element.parentElement` while positioning, so a
   * render that overlaps the first one — or one that lands after the window
   * has closed — reads that parent as null and throws mid-render. The throw
   * happens before `_onRender`, which is where every listener in this file is
   * attached: the window then looks alive and answers nothing.
   */
  async safeRender() {
    if (!this.rendered) return;
    try {
      await this.render();
    } catch (err) {
      console.error(`${MODULE_ID} | redraw failed`, err);
    }
  }

  /** Re-read the preset folder and refresh the dropdown in place. */
  async refreshPresets() {
    this.presets = await listPresets();
    this.#presetsLoaded = true;
    this.#fillPresetSelect();
  }

  /**
   * Fill the preset dropdown from {@link VelvetMoveMenu#presets}.
   *
   * Patched in place rather than redrawn: the listing arrives from the
   * server, and a redraw driven by a network response is precisely the
   * overlapping render that breaks positioning.
   */
  #fillPresetSelect() {
    const select = this.element?.querySelector("[data-preset-select]");
    if (!select) return;

    const options = this.presets.length
      ? this.presets.map(preset => new Option(preset.name, preset.path))
      : [new Option(game.i18n.localize("VELVETMOVE.menu.noPresets"), "")];
    select.replaceChildren(...options);

    const load = this.element?.querySelector('[data-action="loadPreset"]');
    if (load) load.disabled = !this.presets.length;
  }

  /** @override */
  async _prepareContext() {
    const surfaces = getSurfaces();
    const activeId = getSceneSurfaceId();
    const defaultId = Settings.get(SETTINGS.DEFAULT_SURFACE);
    const isGM = game.user.isGM;

    const renderer = activeRenderer();
    const detected = detectRenderer();

    return {
      isGM,
      renderer: {
        active: renderer,
        badge: game.i18n.localize(`VELVETMOVE.settings.renderer.badge.${renderer}`),
        // Say so when the forced choice and the canvas disagree: a hop that
        // travels the wrong way is otherwise a mystery.
        mismatch: renderer !== detected,
        detectedLabel: game.i18n.localize(`VELVETMOVE.settings.renderer.${RENDERER_KEY[detected]}`),
        options: Object.values(RENDERERS).map(value => ({
          value,
          label: `VELVETMOVE.settings.renderer.${RENDERER_KEY[value]}`,
          selected: value === Settings.renderer
        }))
      },
      canUpload: isGM && game.user.can("FILES_UPLOAD"),
      presetFolder: PRESET_FOLDER,
      presets: this.presets,
      activeId,
      selectedCount: canvas?.tokens?.controlled?.length ?? 0,
      surfaces: Object.values(surfaces).map(surface => ({
        ...surface,
        name: surfaceLabel(surface),
        active: surface.id === activeId,
        isDefault: surface.id === defaultId,
        expanded: this.expanded.has(surface.id),
        volumePercent: Math.round((Number(surface.volume) || 1) * 100),
        files: (surface.sounds ?? []).map((path, index) => ({ path, index, name: fileName(path) }))
      })),
      motion: {
        hopEnabled: Settings.hopEnabled,
        hopHeight: Settings.hopHeight,
        hopPercent: Math.round(Settings.hopHeight * 100),
        stepLength: Settings.stepLength,
        ignoreElevated: Settings.ignoreElevated,
        soundEnabled: Settings.soundEnabled,
        talespireEcosystem: Settings.talespireEcosystem,
        masterVolume: Settings.masterVolume,
        volumePercent: Math.round(Settings.masterVolume * 100),
        pitchVariation: Settings.pitchVariation,
        pitchPercent: Math.round(Settings.pitchVariation * 100),
        audienceOptions: Object.values(AUDIENCE).map(value => ({
          value,
          label: `VELVETMOVE.settings.audience.${value}`,
          selected: value === Settings.audience
        }))
      }
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;

    for (const input of root.querySelectorAll("[data-setting]")) {
      input.addEventListener("change", event => void this.#onSettingChange(event));
    }
    for (const input of root.querySelectorAll("[data-surface-field]")) {
      input.addEventListener("change", event => void this.#onSurfaceFieldChange(event));
    }
    // Slider labels track the thumb; the value is only stored on release.
    for (const range of root.querySelectorAll('input[type="range"]')) {
      range.addEventListener("input", event => this.#syncRangeLabel(event.target));
    }

    /* Read the preset folder once the window is on screen. Doing this from
       _prepareContext raced the very render that was preparing it: the
       listing came back before the element had been inserted, and the redraw
       it triggered measured a parent that did not exist yet. */
    if (game.user.isGM && !this.#presetsLoaded) {
      this.#presetsLoaded = true;
      listPresets()
        .then(found => {
          this.presets = found;
          this.#fillPresetSelect();
        })
        .catch(err => console.warn(`${MODULE_ID} | could not read the preset folder`, err));
    }
  }

  /** Keep a slider's printed value in step with its thumb. */
  #syncRangeLabel(range) {
    const output = range.parentElement?.querySelector(".vmove-value");
    if (!output) return;
    const value = Number(range.value);
    output.textContent = output.classList.contains("vmove-value-plain")
      ? value.toFixed(2)
      : `${Math.round(value * 100)}%`;
  }

  /**
   * A client or world setting changed.
   * Writes through without redrawing — the DOM already shows the new value,
   * and a redraw here would fight the control the user is still holding.
   */
  async #onSettingChange(event) {
    const input = event.currentTarget;
    const key = input.dataset.setting;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (input.type === "range" || input.type === "number") value = Number(value);

    const worldKeys = [SETTINGS.STEP_LENGTH, SETTINGS.IGNORE_ELEVATED, SETTINGS.TALESPIRE_ECOSYSTEM];
    if (!game.user.isGM && worldKeys.includes(key)) {
      ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.gmOnly"));
      return;
    }

    try {
      await Settings.set(key, value);
    } catch (err) {
      console.error(`${MODULE_ID} | could not save "${key}"`, err);
      ui.notifications.error(game.i18n.format("VELVETMOVE.error.action", {
        action: key, message: err?.message ?? String(err)
      }));
    }
  }

  /** A surface's name, icon or volume changed. */
  async #onSurfaceFieldChange(event) {
    if (!game.user.isGM) return;
    const input = event.currentTarget;
    const { surfaceId, surfaceField } = input.dataset;
    const surfaces = getSurfaces();
    const surface = surfaces[surfaceId];
    if (!surface) return;

    surface[surfaceField] = surfaceField === "volume" ? Number(input.value) : input.value;

    try {
      await saveSurfaces(surfaces);
    } catch (err) {
      console.error(`${MODULE_ID} | could not save the surface library`, err);
      ui.notifications.error(game.i18n.format("VELVETMOVE.error.action", {
        action: "surface", message: err?.message ?? String(err)
      }));
      return;
    }

    // Patch the row in place. Redrawing here would pull the caret out of the
    // field the user just typed into.
    const row = this.element.querySelector(`.vmove-surface[data-surface-id="${CSS.escape(surfaceId)}"]`);
    if (surfaceField === "label") {
      const nameEl = row?.querySelector(".vmove-surface-name");
      if (nameEl) nameEl.textContent = surfaceLabel(surface);
    }
    if (surfaceField === "icon") {
      const iconEl = row?.querySelector(".vmove-surface-pick > i");
      if (iconEl) iconEl.className = surface.icon;
    }
  }
}
