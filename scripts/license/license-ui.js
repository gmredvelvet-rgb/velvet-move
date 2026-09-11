/**
 * Velvet Move — avisos de licencia y recordatorio de prueba.
 *
 * This module is never gated: an unlicensed world keeps every feature and
 * only receives a periodic reminder that it is running the free trial. The
 * GM's card carries the Patreon flow; players get an informational variant.
 *
 * The prompt is a floating card rather than a DialogV2 because a dialog
 * closes the moment any button is pressed, so starting the Patreon flow
 * would tear down the very UI holding the "I have a code" fallback —
 * leaving nowhere to paste the code the popup just produced.
 */

import { MODULE_ID, MODULE_TITLE, SETTINGS } from "../constants.js";
import LicenseClient, { L } from "./license-client.js";

/** Single card at a time. */
const CARD_ID = `${MODULE_ID}-license-card`;

/** How often the trial reminder reappears, and how long it lingers. */
const REMINDER_MS = 5 * 60 * 1000;
const AUTO_HIDE_MS = 30 * 1000;

/**
 * Whether this world holds an active licence, read from the world setting the
 * GM writes so players reach the same verdict without contacting the server.
 * @returns {boolean}
 */
export function isWorldLicensed() {
  try {
    return game.settings.get(MODULE_ID, SETTINGS.WORLD_LICENSED) === true;
  }
  catch ( err ) {
    return false;
  }
}

export default class LicenseUI {
  /** @type {number|null} */
  static #reminderTimer = null;

  /** @type {number|null} */
  static #hideTimer = null;

  /**
   * Show the licence card. Idempotent — calling it again leaves the existing
   * card alone rather than stacking a second one.
   * @param {object} [options]
   * @param {boolean} [options.autoHide]  Dismiss itself after AUTO_HIDE_MS.
   */
  static show({ autoHide = false } = {}) {
    if ( document.getElementById(CARD_ID) ) return;

    const licensed = isWorldLicensed();
    // Only the GM can act on an unlicensed world, so only their card offers
    // the Patreon flow; players get the same notice with a read-only link.
    let markup;
    if ( licensed ) markup = LicenseUI.#activeMarkup();
    else if ( game.user?.isGM ) markup = LicenseUI.#trialMarkupGM();
    else markup = LicenseUI.#trialMarkupPlayer();

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = `vmove-license-card ${licensed ? "is-active" : "is-trial"}`;
    card.innerHTML = markup;

    card.addEventListener("click", event => {
      LicenseUI.#cancelAutoHide();
      const action = event.target.closest("button")?.dataset.action;
      if ( action ) LicenseUI.#onAction(action, card);
    });
    // Reading the card should not make it vanish mid-sentence.
    card.addEventListener("pointerenter", () => LicenseUI.#cancelAutoHide());

    document.body.append(card);
    if ( autoHide ) {
      LicenseUI.#hideTimer = setTimeout(() => {
        LicenseUI.#hideTimer = null;
        card.remove();
      }, AUTO_HIDE_MS);
    }
  }

  /** Remove the card, if one is open. */
  static hide() {
    LicenseUI.#cancelAutoHide();
    document.getElementById(CARD_ID)?.remove();
  }

  /* -------------------------------------------- */
  /*  Trial reminder                              */
  /* -------------------------------------------- */

  /**
   * Start the periodic free-trial reminder. Safe to call repeatedly: it
   * restarts a single timer. The licence state is re-checked on every tick,
   * so activating mid-session silences it without a reload.
   */
  static startReminder() {
    // Only the timer is reset here: the GM's first-run card is already on
    // screen by this point and must survive.
    LicenseUI.#clearTimer();
    if ( isWorldLicensed() ) return;
    LicenseUI.#reminderTimer = setInterval(() => {
      if ( isWorldLicensed() ) return void LicenseUI.stopReminder();
      LicenseUI.show({ autoHide: true });
    }, REMINDER_MS);
  }

  /** Stop the reminder and clear any trial card it left behind. */
  static stopReminder() {
    LicenseUI.#clearTimer();
    const card = document.getElementById(CARD_ID);
    if ( card?.classList.contains("is-trial") ) LicenseUI.hide();
  }

  static #clearTimer() {
    if ( LicenseUI.#reminderTimer ) clearInterval(LicenseUI.#reminderTimer);
    LicenseUI.#reminderTimer = null;
  }

  static #cancelAutoHide() {
    if ( LicenseUI.#hideTimer ) clearTimeout(LicenseUI.#hideTimer);
    LicenseUI.#hideTimer = null;
  }

  /* -------------------------------------------- */
  /*  Markup                                      */
  /* -------------------------------------------- */

  static #header(badge = "") {
    return `
      <header>
        <i class="fa-solid fa-shoe-prints" aria-hidden="true"></i>
        <strong>${MODULE_TITLE}</strong>
        ${badge ? `<span class="vmove-license-badge">${badge}</span>` : ""}
      </header>`;
  }

  /**
   * Transitional notice for patrons whose earlier activation stopped
   * validating. Being asked to re-authorise out of the blue reads as a scam,
   * so it states what changed and — just as important — what did not: same
   * subscription, no new charge, same slots. Drop it once the migration has
   * settled.
   */
  static migrationNotice() {
    return `
      <div style="margin-bottom:.6rem;padding:.5rem .6rem;border-radius:4px;
                  border:1px solid rgba(200,155,60,.35);background:rgba(200,155,60,.08);
                  font-size:.9em;line-height:1.45">
        <strong>${L("MigrationTitle")}</strong><br/>${L("MigrationBody")}
      </div>`;
  }

  static #trialMarkupGM() {
    return `
      ${LicenseUI.#header(L("TrialBadge"))}
      <p class="vmove-license-status">${L("TrialIntro")}</p>
      <p class="vmove-license-note">${L("TrialPitch")}</p>
      ${LicenseUI.migrationNotice()}
      <button type="button" data-action="connect" class="vmove-license-primary">
        <i class="fa-brands fa-patreon" aria-hidden="true"></i> ${L("Connect")}
      </button>
      <button type="button" data-action="code">${L("HaveCode")}</button>
      <button type="button" data-action="dismiss" class="vmove-license-dismiss">${L("Later")}</button>`;
  }

  /**
   * Players are never the customer — the subscription is the GM's alone. This
   * variant states whose trial it is and gets out of the way: no Patreon call
   * to action, and nothing asking them to go pester the GM about it.
   */
  static #trialMarkupPlayer() {
    return `
      ${LicenseUI.#header(L("TrialBadge"))}
      <p class="vmove-license-status">${L("TrialIntroPlayer")}</p>
      <p class="vmove-license-note">${L("TrialPlayerNote")}</p>
      <button type="button" data-action="dismiss" class="vmove-license-dismiss">${L("Close")}</button>`;
  }

  static #activeMarkup() {
    // Inside the trust window this browser may hold no live token at all —
    // say the licence is verified rather than claim a tier we cannot read.
    const tier = LicenseClient.instance.tier;
    const status = (tier === "none") ? L("StatusTrusted") : L("StatusActive", { tier });
    return `
      ${LicenseUI.#header()}
      <p class="vmove-license-status">${status}</p>
      <p class="vmove-license-note">${L("ReleaseHint")}</p>
      <button type="button" data-action="release">${L("Release")}</button>
      <button type="button" data-action="dismiss" class="vmove-license-dismiss">${L("Close")}</button>`;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** @param {string} action @param {HTMLElement} card */
  static async #onAction(action, card) {
    switch ( action ) {
      case "connect": return void LicenseUI.#connect(card);
      case "code": return void LicenseUI.#enterCode(card);
      case "release": return void LicenseUI.#release(card);
      case "dismiss": return void card.remove();
      default: return undefined;
    }
  }

  /**
   * Run the Patreon flow. The card stays put throughout, so a blocked popup
   * or a rejected exchange still leaves the code route one tap away.
   * @param {HTMLElement} card
   */
  static async #connect(card) {
    const button = card.querySelector('[data-action="connect"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = L("Opening");

    try {
      const connected = await LicenseClient.instance.startOAuth();
      if ( connected ) {
        LicenseUI.stopReminder();
        return void card.remove();
      }
      ui.notifications?.info(`${MODULE_TITLE}: ${L("Cancelled")}`);
    }
    catch ( err ) {
      console.error(`${MODULE_TITLE} | Patreon authorisation failed`, err);
      ui.notifications?.error(`${MODULE_TITLE}: ${err.message}`);
      // The code is single-use and short-lived: offer it straight back rather
      // than making the user repeat the whole round trip.
      if ( err.authCode ) return void LicenseUI.#enterCode(card, err.authCode, err.message);
    }
    finally {
      if ( document.body.contains(card) ) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  /**
   * Manual code entry: the fallback for blocked popups and the retry path
   * for a rejected exchange.
   * @param {HTMLElement} card
   * @param {string} [prefill]
   * @param {string} [error]
   */
  static async #enterCode(card, prefill = "", error = "") {
    // Both values reach the DOM as markup: `prefill` is an auth code echoed
    // back from the popup and `error` is a message from the licence server,
    // so neither is ours to trust with raw HTML.
    const escape = value => foundry.utils.escapeHTML?.(String(value)) ?? String(value);
    const notice = error
      ? `<p style="color:var(--color-level-error, #d05); margin-bottom:.5rem">${escape(error)}</p>`
      : "";

    const code = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${MODULE_TITLE} — ${L("CodeTitle")}` },
      classes: ["velvet-config", "velvet-dialog"],
      content: `${notice}
        ${LicenseUI.migrationNotice()}
        <p style="margin-bottom:.5rem">${L("CodeHint")}</p>
        <input type="text" name="code" autocomplete="off" spellcheck="false" value="${escape(prefill)}"
               style="width:100%;font-family:monospace;font-size:16px">`,
      ok: {
        label: L("Activate"),
        icon: "fa-solid fa-key",
        callback: (event, button) => button.form?.elements.code?.value?.trim()
      },
      rejectClose: false
    });
    if ( !code ) return;

    try {
      await LicenseClient.instance.activateWithCode(code);
      LicenseUI.stopReminder();
      card.remove();
    }
    catch ( err ) {
      console.error(`${MODULE_TITLE} | Activation failed`, err);
      ui.notifications?.error(`${MODULE_TITLE}: ${err.message}`);
    }
  }

  /** @param {HTMLElement} card */
  static async #release(card) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${MODULE_TITLE} — ${L("Release")}` },
      classes: ["velvet-config", "velvet-dialog"],
      content: `<p>${L("ReleaseConfirm")}</p>`,
      rejectClose: false
    });
    if ( !confirmed ) return;
    if ( await LicenseClient.instance.releaseInstallation() ) {
      card.remove();
      LicenseUI.startReminder();
      LicenseUI.show();
    }
  }
}

/**
 * Settings-menu entry point, built on demand rather than at import time.
 *
 * Extending `foundry.applications.api.ApplicationV2` at module scope would
 * evaluate that path while the file loads: if a future release moves or
 * renames it, the entire module would fail to import — a total outage caused
 * by a settings button. Resolving it inside a function defers the lookup to
 * `init`, when the API is present.
 *
 * `registerMenu` only ever constructs the class and calls `render()`.
 * @returns {Function} A class suitable for `game.settings.registerMenu`.
 */
/**
 * Registrar la entrada "Gestionar licencia" en los ajustes del módulo.
 * Vive aquí porque la clase del menú sale de {@link licenseMenuClass}.
 * @returns {void}
 */
export function registerLicenseMenu() {
  game.settings.registerMenu(MODULE_ID, SETTINGS.LICENSE_MENU, {
    name: "VELVETMOVE.License.Settings.Name",
    label: "VELVETMOVE.License.Settings.Label",
    hint: "VELVETMOVE.License.Settings.Hint",
    icon: "fa-brands fa-patreon",
    type: licenseMenuClass(),
    restricted: true
  });
}

export function licenseMenuClass() {
  const Base = foundry.applications?.api?.ApplicationV2;
  if ( !Base ) {
    return class LicenseMenuShim {
      async render() {
        LicenseUI.show();
        return this;
      }

      async close() {
        return this;
      }
    };
  }

  return class LicenseMenu extends Base {
    static DEFAULT_OPTIONS = { id: `${MODULE_ID}-license-menu` };

    /** @override — hand straight over to the card instead of drawing a form. */
    async render() {
      // The menu is an explicit request, so replace whatever is on screen.
      LicenseUI.hide();
      LicenseUI.show();
      return this;
    }

    /** @override */
    async close() {
      return this;
    }
  };
}
