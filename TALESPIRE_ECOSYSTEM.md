# Velvet Move 1.2.3 - TaleSpire Ecosystem

## Setup

1. Reload Foundry after updating Velvet Move and TaleSpire Canvas Bridge.
2. Enable Velvet Move and TaleSpire Canvas Bridge. Keep the existing License Hub enabled.
3. The GM opens Settings > Configure Settings > Velvet Move and enables **TaleSpire ecosystem**.
4. Open **Footstep sound library > Open sound panel** from the same settings page.
5. Stone, wood, grass, dirt, gravel and water include editable default audio samples.
   Choose the scene floor or world default; replace or remove samples in the sound panel.
6. Link the TaleSpire miniature to its Foundry token. Connect the launcher's Data Symbiote.
7. Move the miniature in TaleSpire. Each connected Foundry client plays its own copy locally.

The same toggle is available in the GM's existing sound panel. Players keep their own
sound mute, volume and audience settings. The option is off by default.

## How It Works

The bridge emits a local talespireBridge.creatureMotion event for linked miniature
movement before the active GM writes the TokenDocument. Velvet Move uses those
positions even when Foundry's canvas movement constraints prevent a token update.
The existing talespireSync token update remains a fallback for other clients. Once
direct movement is available, matching token updates do not add a second sound.
No extra socket, executable or TaleSpire mod is installed.
Normal Foundry movement continues using the original animation and sound tracker.

Sounds use the token's surface override, then its parent scene's floor, then the
world default. In a canvas-less overlay, the floor selector can edit the bridge's
runtime scene. The module does not inspect TaleSpire terrain: choose wood, stone,
grass or another surface yourself. Existing sound libraries and license behavior
are preserved. Zero surface volume now actually mutes that surface.

## Limits

- An active GM and valid miniature link are required for movement synchronization.
- Every listener needs Velvet Move enabled in the Foundry world.
- Six surfaces include bundled samples under assets/footsteps. Other surfaces start empty.
  Existing saved libraries are preserved, including intentionally empty surfaces.
- Hidden tokens do not sound for players. Owned/controlled audience filters still apply;
  controlled means the selected miniature or the bridge's active character.
- Browser audio must be unlocked by user interaction. The preview button can help.
- New tokens seed silently. Identical positions and vertical-only updates do not sound.
- Direct movement starts with a footstep even for a short drag. Longer same-board
  movement produces a bounded burst of up to eight samples, not an unlimited queue.
- Board and sub-board changes are silent. The token-update fallback treats updates
  longer than three grid cells as teleports. Direct same-board events cannot distinguish
  an explicit teleport from a long drag reported as one endpoint.
- Footsteps follow incoming position updates, not a skeletal walking animation.
- TaleSpire height alone is not treated as flight: it can also be an upper floor.
- Sound is local to Foundry's browser/overlay, not injected into TaleSpire's audio mixer.

## Compatibility and Verification

The manifest targets Foundry v13-v14 (minimum 13, verified target 14). Existing
ApplicationV2, scene-controls, file-picker and audio APIs are retained; the menu
opener now uses the modern force-render options. Settings provides sound-panel
access without needing an active canvas.

Run:
- node tests/run.mjs
- node --test tests/talespire-footsteps.test.mjs

Sixteen regression tests cover canvas-less playback, local audio, surface choice,
stride accumulation, duplicates, teleports, mute, hidden/owned/selected filtering,
native animation deduplication, queued-sound cleanup and settings registration.
Direct events also cover short drags, long drags, unchanged document coordinates,
context changes and token-update deduplication. Existing static, renderer and
scene-control checks also pass. The bridge integration suite passes 225 tests,
including direct events on player clients and before a failed GM document write.

Real v13 and v14 multiplayer audio sessions remain manual acceptance tests. Automated
mocks do not certify the installed browser's audio permissions or every Symbiote's
movement event cadence. The source and installed bridge module include this update;
no launcher rebuild is required. An older installer can overwrite these module fixes.

## Sidebar Opening Fix

The main footprint icon now opens or focuses the sound panel, including clicks when
its control group is already selected. The sliders tool retains its open/close toggle.
Constructor and render failures display an error and release the opening guard so a
later click can retry. Five regression tests cover group activation, repeated clicks,
constructor failure, render failure and the sliders toggle.
