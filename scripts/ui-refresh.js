/**
 * Velvet Move — rebuilding the scene controls, safely.
 *
 * `ui.controls.render({reset: true})` throws away the control record and asks
 * every module to rebuild its tools. That is the only way a new surface ever
 * reaches the toolbar — SceneControls builds its control set once and reuses
 * it — but it is violent, and *when* it runs matters enormously.
 *
 * A tool's `onChange` runs from inside `SceneControls#activate`, which is
 * still mid-flight: it has patched `aria-pressed` on the rendered buttons and
 * has not finished its post-change callbacks. Resetting from in there swaps
 * the control record while the rendered buttons still describe the old one.
 * The next click then resolves `this.control.tools[data-tool]` to `undefined`
 * and Foundry throws on `tool.button` — the buttons look present and every
 * click errors.
 *
 * So: never synchronously, never from inside a control callback, and never
 * twice in one frame.
 *
 * @module ui-refresh
 */

/** @type {number|null} */
let pending = null;

/**
 * Queue a rebuild of the scene controls for the next animation frame.
 * Repeated calls in the same frame collapse into one.
 */
export function refreshControls() {
  if (pending !== null) return;
  pending = requestAnimationFrame(() => {
    pending = null;
    if (ui.controls?.rendered) ui.controls.render({ reset: true });
  });
}
