import { Settings } from "./settings.js";

export const BRIDGE_ID = "talespire-canvas-bridge";
const bridgeMotion = new WeakSet();

export function setBridgeMotion(tokenDoc, active) {
  if (active) bridgeMotion.add(tokenDoc);
  else bridgeMotion.delete(tokenDoc);
}

export function suppressNativeFootsteps(tokenDoc) {
  return Boolean(linkedCreature(tokenDoc) && bridgeMotion.has(tokenDoc));
}

export function bridgeApi() {
  const module = game.modules.get(BRIDGE_ID);
  return module?.active ? module.api : null;
}

export function linkedCreature(tokenDoc) {
  if (!Settings.talespireEcosystem) return null;
  const links = bridgeApi()?.links;
  const id = links?.findCreatureByToken(tokenDoc);
  return id && links.findTokenByCreature(id)?.uuid === tokenDoc.uuid ? id : null;
}

export function audibleBridgeToken(tokenDoc) {
  if (!tokenDoc?.actor || (tokenDoc.hidden && !game.user.isGM)) return false;
  switch (Settings.audience) {
    case "owned": return tokenDoc.isOwner === true;
    case "controlled": {
      const selection = bridgeApi()?.selection;
      const minis = [...(selection?.minis ?? []), ...(selection?.controlled ?? [])];
      return minis.some(mini => mini.id === linkedCreature(tokenDoc));
    }
    default: return true;
  }
}
