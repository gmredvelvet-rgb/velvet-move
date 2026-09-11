/**
 * Velvet Move — entry point.
 *
 * A bounce on every step and a footstep to go with it, built to survive
 * Isometric Perspective rewriting token meshes underneath it.
 *
 * @module main
 */

import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerSettings, Settings } from "./settings.js";
import LicenseClient from "./license/license-client.js";
import LicenseUI, { isWorldLicensed, registerLicenseMenu } from "./license/license-ui.js";
import { hubActive, licenseHub } from "./license/license-hub.js";
import { registerControls, openMenu } from "./controls.js";
import { Motion } from "./motion.js";
import { VelvetMoveMenu } from "./apps/menu.js";
import {
  getSurfaces, getSceneSurfaceId, setSceneSurfaceId, setTokenSurfaceId, resolveSurface
} from "./surfaces.js";
import { previewSurface } from "./audio.js";
import { liftVector, flatLiftVector } from "./projection.js";
import { activeRenderer, detectRenderer, isIsometricScene, is3DActive } from "./renderers.js";
import {
  buildConfig, serializeConfig, parseConfig, applyConfig,
  listPresets, savePreset, loadPreset
} from "./config-io.js";

Hooks.once("init", () => {
  registerSettings();
  // Con el hub activo, su menú es el único sitio donde gestionar la licencia.
  if ( !hubActive() ) registerLicenseMenu();
  registerControls();
});

Hooks.once("ready", () => {
  /* Deliberately started here rather than at module load: hooks fire in
     registration order, and Isometric Perspective registers its own
     `refreshToken` handler while its module file evaluates. Registering
     during `ready` puts our repaint behind theirs, which is the only place
     the hop's offset survives to the frame. */
  Motion.activate();

  game.modules.get(MODULE_ID).api = {
    // The guarded opener, not a fresh instance: two windows sharing an
    // element id detach each other's DOM node.
    openMenu,
    getSurfaces,
    getSceneSurfaceId,
    setSceneSurfaceId,
    setTokenSurfaceId,
    resolveSurface,
    previewSurface,
    isIsometricScene,
    is3DActive,
    activeRenderer,
    detectRenderer,
    liftVector,
    flatLiftVector,
    settings: Settings,
    motion: Motion,
    // Saving and moving a setup between worlds, also reachable from a macro.
    config: {
      build: buildConfig,
      serialize: serializeConfig,
      parse: parseConfig,
      apply: applyConfig,
      listPresets,
      savePreset,
      loadPreset
    }
  };

  console.log(`${MODULE_ID} | ready — renderer: ${activeRenderer()} (detected: ${detectRenderer()})`);

  // Lo último a propósito: el salto y los pasos ya están activos antes de que
  // la licencia toque la red, así que una caída del servidor no retrasa nada
  // ni deja el módulo a medias.
  startLicenceCheck();
});

/**
 * Comprobación de licencia. Gate **blando** deliberado: el módulo funciona
 * entero con licencia y sin ella, y un mundo sin licencia sólo recibe un
 * recordatorio periódico. Sólo el cliente del GM habla con el servidor: escribe
 * el flag de mundo que leen los demás, así que los jugadores nunca lo contactan.
 * @returns {Promise<void>}
 */
async function startLicenceCheck() {
  // Foundry también carga los módulos en las pantallas de join, setup y stream,
  // donde no hay mundo que licenciar ni a quién preguntar.
  if ( game.view !== "game" ) return;
  // Con el hub activo la licencia es del hub: registrarse y callarse — ni
  // servidor, ni tarjeta, ni recordatorio propios.
  const hub = licenseHub();
  if ( hub ) return void hub.register(MODULE_ID);
  try {
    if ( game.user?.isGM ) {
      // Cierto si está verificada ahora mismo o si sigue dentro de la ventana
      // de 30 días que compró una verificación anterior: a un GM que ya
      // autorizó no se le vuelve a preguntar.
      const licensed = await LicenseClient.instance.initialize();
      if ( licensed ) await game.settings.set(MODULE_ID, SETTINGS.WORLD_LICENSED, true);
      // Nunca abrir con la tarjeta si el mundo ya está licenciado: eso es un
      // segundo navegador o una caída del servidor, no alguien a quien haya que
      // preguntar.
      else if ( !LicenseClient.instance.hasStoredCredentials && !isWorldLicensed() ) LicenseUI.show();
    }
    LicenseUI.startReminder();
  }
  catch ( err ) {
    // La capa de licencia no puede llevarse el módulo por delante.
    console.error(`${MODULE_ID} | falló la comprobación de licencia`, err);
  }
}

// Que el GM autorice a mitad de sesión silencia el recordatorio en todos los
// clientes conectados sin que nadie recargue: el flag llega como actualización
// de un ajuste de mundo.
Hooks.on("updateSetting", setting => {
  if ( setting.key !== `${MODULE_ID}.${SETTINGS.WORLD_LICENSED}` ) return;
  if ( licenseHub() ) return;
  if ( isWorldLicensed() ) LicenseUI.stopReminder();
  else LicenseUI.startReminder();
});

Hooks.on("canvasReady", () => {
  // `activate` is a no-op once it has taken; it is repeated here for the case
  // where the canvas was not up yet when `ready` fired.
  Motion.activate();
  Motion.reset();
});
Hooks.on("deleteToken", tokenDoc => Motion.forget(tokenDoc.id));

/* 3D Canvas rebuilds every token when it opens or closes. Any hop in flight
   belongs to the outgoing renderer and has nowhere to be put down, so the
   whole board starts from the floor again. */
Hooks.on("3DCanvasToggleMode", () => Motion.reset());
