/**
 * Velvet Move — the quick menu.
 *
 * One window, opened from the left-hand toolbar: pick the floor the scene
 * walks on, hang sound files off each floor with a file picker, and tune the
 * hop. GMs get the whole surface library; players get the half that is theirs
 * — volume, audience, whether they want the bounce at all.
 *
 * @module apps/menu
 */

import { MODULE_ID, SETTINGS, SURFACE_FLAG, AUDIENCE } from "../constants.js";
import { Settings } from "../settings.js";
import {
  getSurfaces, saveSurfaces, surfaceLabel, getSceneSurfaceId, setSceneSurfaceId,
  setTokenSurfaceId, browseAudioFolder, filePicker
} from "../surfaces.js";
import { previewSurface, play } from "../audio.js";
import { isIsometricScene } from "../projection.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** Strip a path down to something readable in a narrow list. */
function fileName(path) {
  try {
    return decodeURIComponent(path.split("?")[0].split("/").pop());
  } catch {
    return path;
  }
}

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
    position: { width: 520, height: 640 },
    actions: {
      activate: VelvetMoveMenu.#onActivate,
      preview: VelvetMoveMenu.#onPreview,
      addFile: VelvetMoveMenu.#onAddFile,
      addFolder: VelvetMoveMenu.#onAddFolder,
      playSound: VelvetMoveMenu.#onPlaySound,
      removeSound: VelvetMoveMenu.#onRemoveSound,
      addSurface: VelvetMoveMenu.#onAddSurface,
      deleteSurface: VelvetMoveMenu.#onDeleteSurface,
      assignTokens: VelvetMoveMenu.#onAssignTokens,
      clearTokens: VelvetMoveMenu.#onClearTokens,
      toggleExpand: VelvetMoveMenu.#onToggleExpand
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/menu.hbs`,
      scrollable: [".vm-surfaces"]
    }
  };

  /** Surface ids whose sound list is open. Survives re-renders. */
  #expanded = new Set();

  /** @override */
  async _prepareContext() {
    const surfaces = getSurfaces();
    const activeId = getSceneSurfaceId();
    const isGM = game.user.isGM;

    return {
      isGM,
      isometric: isIsometricScene(),
      activeId,
      selectedCount: canvas?.tokens?.controlled?.length ?? 0,
      surfaces: Object.values(surfaces).map(surface => ({
        ...surface,
        name: surfaceLabel(surface),
        active: surface.id === activeId,
        expanded: this.#expanded.has(surface.id),
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
        masterVolume: Settings.masterVolume,
        volumePercent: Math.round(Settings.masterVolume * 100),
        pitchVariation: Settings.pitchVariation,
        pitchPercent: Math.round(Settings.pitchVariation * 100),
        audience: Settings.audience,
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

    // Live controls: sliders and toggles write straight through, so the next
    // step you take already sounds like the change you just made.
    for (const input of root.querySelectorAll("[data-setting]")) {
      input.addEventListener("change", this.#onSettingChange.bind(this));
    }
    for (const input of root.querySelectorAll("[data-surface-field]")) {
      input.addEventListener("change", this.#onSurfaceFieldChange.bind(this));
    }
    // Slider labels should track the thumb, not wait for a commit.
    for (const range of root.querySelectorAll('input[type="range"]')) {
      range.addEventListener("input", event => {
        const output = event.target.parentElement?.querySelector(".vm-value");
        if (!output) return;
        const value = Number(event.target.value);
        output.textContent = output.classList.contains("vm-value-plain")
          ? value.toFixed(2)
          : `${Math.round(value * 100)}%`;
      });
    }
  }

  /** A client or world setting changed. */
  async #onSettingChange(event) {
    const input = event.currentTarget;
    const key = input.dataset.setting;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (input.type === "range" || input.type === "number") value = Number(value);

    if (!game.user.isGM && [SETTINGS.STEP_LENGTH, SETTINGS.IGNORE_ELEVATED].includes(key)) return;

    await Settings.set(key, value);
    this.render();
  }

  /** A surface's label, icon or volume changed. */
  async #onSurfaceFieldChange(event) {
    if (!game.user.isGM) return;
    const input = event.currentTarget;
    const { surfaceId, surfaceField } = input.dataset;
    const surfaces = getSurfaces();
    const surface = surfaces[surfaceId];
    if (!surface) return;

    surface[surfaceField] = surfaceField === "volume" ? Number(input.value) : input.value;
    await saveSurfaces(surfaces);
    this.render();
  }

  /* ---------------------------------------- */
  /*  Actions                                 */
  /* ---------------------------------------- */

  static async #onActivate(event, target) {
    const id = target.dataset.surfaceId;
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.gmOnly"));
      return;
    }
    await setSceneSurfaceId(id);
    this.render();
  }

  static #onPreview(event, target) {
    const surface = getSurfaces()[target.dataset.surfaceId];
    if (surface) previewSurface(surface);
  }

  static #onToggleExpand(event, target) {
    const id = target.dataset.surfaceId;
    if (this.#expanded.has(id)) this.#expanded.delete(id);
    else this.#expanded.add(id);
    this.render();
  }

  static async #onAddFile(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.surfaceId;
    const FP = filePicker();
    if (!FP) return;

    const picker = new FP({
      type: "audio",
      callback: async path => {
        const surfaces = getSurfaces();
        const surface = surfaces[id];
        if (!surface || surface.sounds.includes(path)) return;
        surface.sounds.push(path);
        await saveSurfaces(surfaces);
        this.#expanded.add(id);
        this.render();
      }
    });
    picker.render(true);
  }

  static async #onAddFolder(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.surfaceId;
    const FP = filePicker();
    if (!FP) return;

    const picker = new FP({
      type: "folder",
      callback: async path => {
        const found = await browseAudioFolder(path, "data");
        if (!found.length) {
          ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.emptyFolder"));
          return;
        }
        const surfaces = getSurfaces();
        const surface = surfaces[id];
        if (!surface) return;
        // Resolved once, here, and stored as plain paths: a footstep must
        // never wait on a directory listing.
        surface.sounds = Array.from(new Set([...surface.sounds, ...found]));
        await saveSurfaces(surfaces);
        this.#expanded.add(id);
        this.render();
        ui.notifications.info(game.i18n.format("VELVETMOVE.notify.folderAdded", { count: found.length }));
      }
    });
    picker.render(true);
  }

  static #onPlaySound(event, target) {
    void play(target.dataset.path, Settings.masterVolume, 0);
  }

  static async #onRemoveSound(event, target) {
    if (!game.user.isGM) return;
    const { surfaceId, index } = target.dataset;
    const surfaces = getSurfaces();
    const surface = surfaces[surfaceId];
    if (!surface) return;
    surface.sounds.splice(Number(index), 1);
    await saveSurfaces(surfaces);
    this.render();
  }

  static async #onAddSurface() {
    if (!game.user.isGM) return;
    const name = await DialogV2.prompt({
      window: { title: game.i18n.localize("VELVETMOVE.menu.newSurface") },
      content: `<input type="text" name="label" autofocus placeholder="${game.i18n.localize("VELVETMOVE.menu.newSurfacePlaceholder")}">`,
      ok: {
        label: game.i18n.localize("VELVETMOVE.menu.create"),
        callback: (event, button) => button.form.elements.label.value?.trim()
      },
      rejectClose: false
    });
    if (!name) return;

    const surfaces = getSurfaces();
    // Slugify, then de-duplicate: two surfaces sharing a key would silently
    // overwrite each other in the settings object.
    const base = name.slugify({ strict: true }) || "surface";
    let id = base;
    let n = 2;
    while (surfaces[id]) id = `${base}-${n++}`;

    surfaces[id] = { id, label: name, icon: "fa-solid fa-shoe-prints", sounds: [], volume: 1 };
    await saveSurfaces(surfaces);
    this.#expanded.add(id);
    this.render();
  }

  static async #onDeleteSurface(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.surfaceId;
    const surfaces = getSurfaces();
    const surface = surfaces[id];
    if (!surface) return;

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("VELVETMOVE.menu.deleteSurface") },
      content: `<p>${game.i18n.format("VELVETMOVE.menu.deleteConfirm", { name: surfaceLabel(surface) })}</p>`,
      rejectClose: false
    });
    if (!confirmed) return;

    delete surfaces[id];
    if (!Object.keys(surfaces).length) {
      ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.lastSurface"));
      return;
    }
    await saveSurfaces(surfaces);
    if (Settings.get(SETTINGS.DEFAULT_SURFACE) === id) {
      await Settings.set(SETTINGS.DEFAULT_SURFACE, Object.keys(surfaces)[0]);
    }
    this.render();
  }

  static async #onAssignTokens(event, target) {
    const selected = canvas?.tokens?.controlled ?? [];
    if (!selected.length) {
      ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.noSelection"));
      return;
    }
    await setTokenSurfaceId(selected.map(t => t.document), target.dataset.surfaceId);
    ui.notifications.info(game.i18n.format("VELVETMOVE.notify.assigned", { count: selected.length }));
    this.render();
  }

  static async #onClearTokens() {
    const selected = (canvas?.tokens?.controlled ?? [])
      .filter(t => t.document.getFlag(MODULE_ID, SURFACE_FLAG));
    if (!selected.length) {
      ui.notifications.warn(game.i18n.localize("VELVETMOVE.notify.noSelection"));
      return;
    }
    await setTokenSurfaceId(selected.map(t => t.document), null);
    this.render();
  }
}
