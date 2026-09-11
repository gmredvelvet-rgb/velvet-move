/**
 * Velvet Move — file access.
 *
 * Everything that touches the Foundry file layer goes through here, for one
 * reason: the previous version returned silently when it could not find the
 * file picker class, so a button that failed looked exactly like a button that
 * did nothing. Every entry point below either succeeds or throws with
 * something a human can read.
 *
 * @module files
 */

import { AUDIO_EXTENSIONS } from "./constants.js";

/**
 * The file picker class for this core version.
 * @returns {typeof FilePicker}
 * @throws {Error} If no file picker can be found at all.
 */
export function filePicker() {
  const FP = foundry.applications?.apps?.FilePicker?.implementation
    ?? foundry.applications?.apps?.FilePicker
    ?? globalThis.CONFIG?.ux?.FilePicker
    ?? globalThis.FilePicker;
  if (!FP) throw new Error(game.i18n.localize("VELVETMOVE.error.noFilePicker"));
  return FP;
}

/** Whether a file picker is available without throwing. */
export function hasFilePicker() {
  try {
    return !!filePicker();
  } catch {
    return false;
  }
}

/** The data source to read and write in — the Forge rewrites this. */
export function defaultSource() {
  if (typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge) return "forgevtt";
  return "data";
}

/**
 * Open the picker and resolve with the chosen path, or null if the user
 * closed it without choosing.
 *
 * ApplicationV2 does not always run the callback on a plain close, so the
 * `close` option is what guarantees the promise settles — without it a
 * cancelled picker would leave the caller waiting forever.
 *
 * @param {object} [options]
 * @param {string} [options.type]     "audio", "folder", …
 * @param {string} [options.current]  Path to open at.
 * @param {string} [options.title]
 * @returns {Promise<string|null>}
 */
export function pick({ type = "audio", current = "", title = null } = {}) {
  const FP = filePicker();
  return new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      resolve(value ?? null);
    };

    const picker = new FP({
      type,
      current,
      ...(title ? { title } : {}),
      callback: path => done(path),
      close: () => done(null)
    });
    picker.render(true);
  });
}

/**
 * List a directory, trying each plausible source.
 * @param {string} path
 * @returns {Promise<{dirs: string[], files: string[], source: string}>}
 */
export async function browse(path) {
  const FP = filePicker();
  const sources = [...new Set([defaultSource(), "data", "public"])];
  let lastError = null;

  for (const source of sources) {
    try {
      const result = await FP.browse(source, path);
      return { dirs: result?.dirs ?? [], files: result?.files ?? [], source };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`Could not read "${path}"`);
}

/** @returns {boolean} Whether a path looks like an audio file. */
export function isAudioFile(path) {
  const lower = String(path).toLowerCase().split("?")[0];
  return AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Every audio file in a folder, and in the folders under it.
 *
 * Sound packs are routinely shipped as `footsteps/stone/01.ogg`, so stopping
 * at the top level would report an empty folder for the most common layout
 * there is. Depth is capped rather than unbounded: two levels covers the way
 * packs are actually organised without walking someone's entire data drive.
 *
 * @param {string} path
 * @param {number} [depth]
 * @returns {Promise<string[]>}
 */
export async function browseAudio(path, depth = 2) {
  const { dirs, files } = await browse(path);
  const found = files.filter(isAudioFile);

  if (depth > 0) {
    for (const dir of dirs) {
      try {
        found.push(...await browseAudio(dir, depth - 1));
      } catch {
        // An unreadable subfolder is not a reason to lose the rest.
      }
    }
  }
  return found;
}

/**
 * Create a folder path, one segment at a time — `createDirectory` fails when
 * the parent does not exist yet.
 * @param {string} path
 * @param {string} [source]
 * @returns {Promise<void>}
 */
export async function ensureDirectory(path, source = defaultSource()) {
  const FP = filePicker();
  let current = "";
  for (const segment of path.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await FP.browse(source, current);
    } catch {
      try {
        await FP.createDirectory(source, current);
      } catch (err) {
        // Another client may have created it between the browse and the
        // create; only a different failure is worth reporting.
        const message = String(err?.message ?? err).toLowerCase();
        if (!message.includes("exist")) throw err;
      }
    }
  }
}

/**
 * Write a text file to the Foundry server.
 * @param {string} folder    Folder path, created if missing.
 * @param {string} filename
 * @param {string} text
 * @returns {Promise<string>} The stored path.
 */
export async function writeTextFile(folder, filename, text) {
  if (!game.user.can("FILES_UPLOAD")) {
    throw new Error(game.i18n.localize("VELVETMOVE.error.noUpload"));
  }
  const source = defaultSource();
  await ensureDirectory(folder, source);

  const file = new File([text], filename, { type: "application/json" });
  const response = await filePicker().upload(source, folder, file, {}, { notify: false });
  if (!response?.path) throw new Error(game.i18n.format("VELVETMOVE.error.uploadFailed", { filename }));
  return response.path;
}

/**
 * Read a text file back off the server.
 * @param {string} path
 * @returns {Promise<string>}
 */
export async function readTextFile(path) {
  const url = foundry.utils.getRoute?.(path) ?? path;
  // Cache-busted: a preset saved and re-read in the same session must not
  // come back as the version the browser cached a minute ago.
  const response = await fetch(`${url}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

/**
 * Hand the browser a file to save.
 * @param {string} text
 * @param {string} filename
 */
export function download(text, filename) {
  if (foundry.utils.saveDataToFile) {
    foundry.utils.saveDataToFile(text, "application/json", filename);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately aborts the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask the user for a local file and return its text.
 * @param {string} [accept]
 * @returns {Promise<{name: string, text: string}|null>}
 */
export function readLocalFile(accept = "application/json,.json") {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      done({ name: file.name, text: await file.text() });
    });
    /* A cancelled dialog fires no event in most browsers. `cancel` is the
       modern signal; the focus fallback covers the ones without it, and only
       resolves empty once it can see that no file was actually chosen —
       otherwise it would race the `change` event and discard the pick. */
    input.addEventListener("cancel", () => done(null));
    window.addEventListener("focus", () => setTimeout(() => {
      if (!input.files?.length) done(null);
    }, 1500), { once: true });

    input.click();
  });
}
