# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SHIFT HAPPENS is a 3‑player online co‑op browser game built for a game jam. Three couriers push, pull and pilot one golden artifact through six floating‑island worlds to a castle. The artifact shifts between CUBE, LONG, TALL and ROUND, and each form has a real physical upside and downside. One courier at a time can ride inside it (F) and steer it with shape‑specific controls.

The product spec and source of truth is `MASTER_PROMPT_FOR_OPUS.md`. Its §13 is the acceptance checklist. `docs/GAMEPLAY_EXPANSION.md` covers the six‑world expansion (maps, mechanisms, piloting) and the interface contract with the visuals work; `docs/TEST_CHECKLIST.md` records the acceptance evidence. `ASSETS_LEVELS_BLUEPRINT.md` covers the level and asset plan, and `REFERENCE_IMAGE.jpg` sets the art direction. `README.md` is the player and developer overview.

## Commands

```bash
npm install          # repo .npmrc forces registry.npmjs.org (this machine's default npm registry is an internal CodeArtifact that needs auth)
npm run dev          # tsx-watch server on 127.0.0.1:3000 + Vite on localhost:5173 (proxies /socket.io → 3000); dev tools ON
npm run build        # vite → dist/client, esbuild → dist/server/index.js (node deps stay external)
npm start            # NODE_ENV=production node dist/server/index.js on 127.0.0.1:3000 (PORT / HOST env override); dev tools OFF
npm run typecheck    # tsc --noEmit over src, server, tests (TypeScript 7). There is no linter.
```

There's no test framework. Each test is a standalone script run with `npx tsx tests/<name>.ts [baseUrl]`:

| Script | Needs | Checks |
|---|---|---|
| `sim-test.ts` | nothing (headless Rapier) | push speed with 1/2/3 pushers, grip, every shift, low arch, plate, wind per shape, lever, ROUND on the chute |
| `pilot-test.ts`, `mushroom-test.ts`, `stress-test.ts` | nothing | piloting rules + every shape's controls; springs / puffball / Giant Bounce; shift spam, tunnelling, long rides, crane with a pilot, out of bounds, step cost per world |
| `bot-run.ts [safe\|fast] [world ids] [--room]` | nothing | 3 scripted bots play every world with normal inputs (safe route ≈ 440 s total, 0 drops). `--room` plays one whole adventure through the server `Room` (input packets, 2‑of‑3 votes, adventure totals); `--room <world id>` debugs one world that way. Bots navigate clumsily, so a failure may be bot pathing. Confirm with a focused `debug-*.ts` script. |
| `net-test.ts [url]` | a running server (default `http://127.0.0.1:3000`) | 4 socket clients: 3 matched, 4th isolated, identical snapshots, shift sync, pause |
| `prod-dev-off.ts [url]` | a **production** server | dev commands (`finish`, `map`) are ignored and the lobby reports `dev: false` |
| `net-test2.ts [url]` | **dev** server | lobby world pick (picks made while waiting, invalid picks, split‑vote draw), pilot sync, stale / malformed input packets, identical mechanism state, results votes, a drop + rejoin on the results screen, World 5 cart sync |
| `play-three.ts [url] [outPrefix]` | client URL (default Vite `:5173`, or a prod server URL) | 3 Chrome contexts share one room with an identical artifact state |
| `flow-three.ts [url]` | **dev** server (uses the dev `finish` command) | 4th player isolation, disconnect → pause → reload rejoin, results, majority vote → World 2 |
| `tour.ts`, `play-solo.ts`, `shot.ts`, `audio-check.ts` | dev server | screenshots of every world and the ending in `tests/out/`; audio unlock and decode |
| `thumbs.ts [url] [ids]` | dev server | regenerates the world pictures used by the lobby / results world picker (`public/assets/worlds/<map id>.jpg`, pinned cameras in `SHOTS`) |
| `gallery.ts [url] [outPrefix] [w] [h] [beats]` | dev server | 3 couriers in one room, slot‑0 view captured at fixed beats in every world + ending (look‑dev regression) |
| `look.ts <out> "<query>" '<steps json>'` | dev server | solo room, run dev commands / `window.__SH_CAM(pos, look)` camera pins, screenshot (`@file.json` for long step lists) |
| `camera-test.ts [url]` | dev server | solo room: mouse drag / wheel / touchpad swipe + pinch, pointer lock + Esc, WASD relative to the camera in 5 headings, smooth follow, walls + low arch + 360° sweeps never inside geometry, first person in all 4 shapes (seat, look, drive, ROUND stays level, LONG's A turns left at any heading), V / scroll chase view, hop out, falling, the artifact falling with a pilot, a world change, a reload |
| `camera-three.ts [url] [outPrefix]` | dev server | 3 Chrome sessions: each camera turns / zooms only on its own input, WASD per own camera, one rides in first person while the others keep third person, identical artifact, a reload leaves the others' cameras alone |
| `perf.ts [url] [query]` | dev server | FPS, draw calls and triangles in every world, at its start and a later checkpoint (one full frame, all passes) |
| `debug-leak.ts [url] [trace]` | dev server | GPU geometry/texture counts across repeated world switches; `trace` groups leaked geometries by where they were built |

- Playwright drives the installed Google Chrome (`channel: 'chrome'`, headless, `--use-angle=metal`). No browser download is needed.
- After tuning physics, a mechanism or a map, re‑run `sim-test.ts`, `pilot-test.ts`, `stress-test.ts` and `bot-run.ts safe` (and `fast`); for room or protocol changes also `bot-run.ts safe --room` and `net-test2.ts`; after camera, input or HUD changes `camera-test.ts`, `camera-three.ts` and `flow-three.ts`.

## Architecture (big picture)

**Server‑authoritative, one physics world per room.**
- Call chain: `server/index.ts` (Express + Socket.IO, fixed 60 Hz loop with accumulator) → `matchmaker.ts` (public auto‑match into exactly‑3 rooms, optional room codes, `sessionStorage` session tokens for reconnect) → `room.ts` (phases) → `sim.ts` (the Rapier world).
- Room phases: `waiting → countdown(5 s) → playing ⇄ paused(45 s slot hold) → resuming(3 s) → finished`. The room builds a fresh `Sim` per map (`startMap`). A full room does **not** start by itself: in the lobby each member votes `map:<i>` or `adventure` (all six in a row); on the results screen also `retry` and `next` (adventure only). A majority (2 of 3, everyone connected, full team in the lobby) decides (`tally` → `execute`); if everyone voted and there's no majority, one of the picks is drawn after 5 s (`tieEndsAt`, sent as `lobby.tieMs`). The dev solo room still starts World 1 right away. A drop on the results screen gets the same 45 s grace. `mode` is `adventure` (Worlds 1→6, totals on the last results) or `single`; `history` holds each world's results. Leaving or timing out sends the remaining players back to `waiting` together.
- Clients only send inputs `[seq, mx, mz, jumpCounter, grab, respawnCounter, buttons, pilotCounter, useCounter, camYaw]` at 30 Hz (`buttons`: Q held, Shift sprint), plus `shift`, `act` (`vote`, `resetVote`) and `dev` messages. `mx`/`mz` are already world space (the client turns WASD by its camera); `camYaw` lets the server tell the player's left from right (LONG's swing side, the default exit side). Presses are counters, so a lost packet never loses a press; the room drops stale `seq`s; after a reconnect the sim adopts the client's counters (`syncCounters`), so there are no phantom presses. Clients never simulate physics.

**Shared level data is the single source of truth.**
- `src/shared/level.ts` defines the original course: islands (chamfered rects), tagged boxes, kinematic machines (gate, drawbridge, lift, lever), plate and receiver triggers, wind and fan zones, checkpoints, respawn anchors and the goal.
- `src/shared/maps/` holds the six worlds as `MapDef`s (`MAPS` in order): spawn, checkpoints (`solve` lists what `devWarp` pre‑solves, `cart` where the cart parks), anchors (`req` signal), goal, mechanisms, objectives (`Cond` trees; `text` + optional `tip` in plain English where `[Q]` draws a key cap, `hint` point + extra `marks`), `intro` (goal + this world's shape tradeoff), par, stamps, shortcuts, bounds, music. Worlds 1, 2, 3 and 6 (`course.ts`) reuse `LEVEL`: each of their sims builds **all** of the course statics plus all `COURSE_MECHS`; a mechanism only runs in its own map (`def.map`) and is frozen solved (owner map earlier) or initial elsewhere, and blockers close each map's exits. Worlds 4 (`mushroom.ts`, x = +70) and 5 (`railway.ts`, x = −70) are standalone islands.
- The server builds colliders from it, using `islandBoxes()` for islands. The client builds visuals from the same data (`render/World.tsx`, `render/islandGeo.ts`, `render/worlds/`), so editing the level moves both.
- `render/Props.tsx` and `render/Scenery.tsx` hold decoration only, with **no colliders**. Keep decor out of the play lanes; the `KEEP` keep‑out rectangles in `Scenery.tsx` (plus `LEVEL.decorKeepOut` for gameplay areas) do this for procedural foliage.

**Simulation (`server/sim.ts`).**
- Couriers are dynamic capsules with rotations locked. Movement is velocity‑target control with capped acceleration, and couriers don't collide with each other.
- The artifact is **one** dynamic body. A shift swaps its single collider in `applyShape`:
  - `findShiftPose` aligns the bottom to the floor, keeps yaw (LONG snaps to `longAxisZones`), and checks clearance only against static or barrier colliders.
  - `pushPlayersOut` then moves overlapping couriers onto solid ground.
- Feel systems:
  - `updatePushers`: push assist at the center of mass, plus "stick to face" so off‑center pushes don't slide couriers off.
  - `updateGrips`: clamped spring ropes, horizontal‑only on couriers.
  - Per‑shape viscous ground drag and yaw damping from `shapes.ts`.
- Puzzle rules:
  - Wind applies force, plus a yaw torque on LONG.
  - TALL has a raised center of mass and wobbles unless two or more couriers grip it, which turns on a stabilizer torque. The lever only fires if TALL is upright and held against it for 0.45 s.
  - A magnet pulls LONG into the receiver.
  - The lift and goal require every `requiredPlayers()`, meaning connected and not AFK for 30 s or more.
- Failure handling:
  - The artifact falling below the map's `killY` (or into a hazard) resets it to the checkpoint with a 7 s penalty. Checkpoints only trigger while the artifact rests on the ground (not carried by the crane).
  - A stuck artifact (`watchStuck`) makes the T recall free; leaving the map `bounds` for 3 s recalls it automatically.
  - A courier who falls respawns at the unlocked anchor nearest the artifact.
  - A courier far from the team for 5 s gets "hopped" back.
- Step order: `mechs.pre` → `updatePlayer` → `updateBumps` → `updatePushers` → `updateGrips` → `updateArtifactForces` → `mechs.forces` → `pilot.update` → `world.step` → `postStep` (landing thumps, caps, drops, checkpoints, shortcuts, goal, objective).

**Mechanisms (`server/mechs.ts`).**
- `Mech` subclasses built from map data by `makeMech`: plate, gate, dock (receiver), drawbridge, pushLever, lift, wind, switch (Q: toggle / hold / timed / charge / select / pump), spring, mover, rotor, wobble bridge, slip, puffer, collect, blocker, logic, hazard, cart, crane. Each may publish a boolean signal (`sim.sig(id)`, selector value `sim.sel(id)`) and react to others (`when` / `unless`).
- Hooks: `build`, `pre` (triggers, kinematic targets), `forces` (after grips), `velAt`, `state` (numbers sent in `snapshot.m[i]`), `solve`, `reset` (recall), `shifted`, `progress`, `legacyInto` (fills the legacy `w` fields for Astra's course visuals).
- Moving platforms: couriers have friction 0, so a platform carries them only through `registerCarrier(collider, mech)` + `velAt`; the artifact's ground drag is made relative to its support.
- Launches: `sim.allowLaunch(seconds, speed)` lifts the speed caps, `noDragT` skips ground drag right after a launch, and a launched courier's `launchT` turns off air braking.
- Time‑driven machinery (rotors, movers, gust and puffball cycles) runs only while `playing` / on `sim.runTime`, so the world at GO is identical on every run and holds still through countdowns.
- The crane makes the artifact kinematic (`sim.lockArtifact`); `artifactLocked()` blocks steering, boarding and shifting.

**Piloting (`server/pilot.ts`).** F toggles. Entry needs range (`PILOT_RANGE`), a slow artifact, nobody inside, not carried. The pilot's courier body is disabled while inside. `findExitSpot` rings the artifact for a spot with ground below, a free capsule and line of sight; exits wait for `PILOT_EXIT_MAX_SPEED` and retry for `PILOT_EXIT_RETRY_S`; R bails to the nearest anchor. Per shape: CUBE scoot + Hop, LONG nudge + 90° Swing (signed: `wrapAngle`, the side comes from the input as the player's camera sees it), TALL waddle at the base + lean (`sim.tallWant`) + Brace, ROUND roll torque + Boost.

**Sync and rendering.**
- The server emits a `snap` at 30 Hz with compact arrays (`src/shared/protocol.ts`) and batched reliable `ev` events.
- `src/net/net.ts` keeps a snapshot buffer and a clock‑offset estimate. `frame(delay)` interpolates about 85 ms behind.
- `render/frame.ts` computes **one** `frame.current` per render frame. Your own courier uses a 50 ms delay (and so does the artifact while you pilot it), and a demo frame stands in on the menu. Every 3D component reads `frame.current` inside `useFrame`. High‑frequency state never goes through React. The zustand `app/store.ts` holds UI state only.
- `app/WorldPicker.tsx` is the world grid (picture + name per world, "All six in a row", voter dots, best records from `localStorage`) shared by `Lobby.tsx` and `Results.tsx`. Tests that join through PLAY must vote before the room starts.
- The morph animation and shift sound fire when the **interpolated** shape changes (`Artifact.tsx`), so the visual swap lines up with the server's collider swap. `GameEvents.tsx` turns events into sound effects (CC0 files plus procedural `audio/synth.ts`), particles (`fx` in `Effects.tsx`), toasts, world banners and per‑world music (`playMusic(name, fade, rate)`).
- Maps on the client: `render/mapState.ts` (`useActiveMap()` from `lobby.map`, `activeMap()` from the snapshot's `mp`, `mechState(i)`). `MapWorld.tsx` keeps the course (`World` + `Scenery`) mounted as a **memoized** element and only hides it for Worlds 4/5; `StandaloneWorld` (`render/worlds/`) and `Mechanisms.tsx` (all mechanism visuals) remount per map inside `<Disposer>`, which frees their GPU resources on unmount.
- `render/objective.ts` returns the current point of interest. `app/WorldLabels.tsx` places the in‑world hint there (pinned to the screen edge with an arrow and distance when it's off screen or behind you; the golden object gets the same edge marker), and `render/Beacon.tsx` rings it on the ground with a light column (plus a ring + arrow per `marks` spot). Labels are DOM elements projected through `camRef`; drei `<Html>` was removed because it caused React root‑unmount errors.
- **Camera (`CameraRig.tsx`), one per client.** Modes: menu (cinematic drift), the ending cutscene (`Ending.tsx`) and play, whose view is `orbit` (third person around your courier), `fp` (first person inside the artifact while you pilot it; automatic on hop‑in) or `chase` (third person around the artifact: V, or scroll out of first person / all the way back in). Views blend (`startBlend`); teleports (respawn, recall, new world) cut instead. Input: `render/look.ts` (pointer lock on click, right/left drag, wheel zoom, ctrl‑wheel pinch, sideways swipe turns; sensitivity + invert in the menu, saved in `localStorage`); the view eases toward the input (`yawT` → `yaw`). The rig publishes `input.camYaw`, so WASD follows the camera. Collision: `render/camCollide.ts` casts the camera sphere against the active map's level boxes, islands, closed gates and standing barricades (the same shared data as the server's colliders) and pulls in at once, easing back out; the pivot drops under low ceilings and stops following a fall. Decor has no colliders, so `render/seeThrough.ts` cuts a dithered hole in decor materials (patched in `Models.tsx`'s `harmonize`) along the camera → courier line. A new world / round resets the heading to face down the course. First person: shape seats (`SEAT`), a share of the shell's tilt (never ROUND), near plane 0.05, `camView.fpv` hides the shell (colour/depth writes off, it still casts its shadow), the pilot dome and your name tag, and shows `render/Cockpit.tsx` (golden edge bars / ROUND's gyroscope rings that fade at the middle of the view, rune glass that only tints toward the edges) plus the HUD's `.cockpit-frame`. `camView` also feeds the shadow frustum (`dist`, view direction `fx/fz`) and `hideMe` (camera pressed against your courier). `shakeCamera(amount)` is used for heavy moments.
- **Instructions.** The objective line + tip (`Hud.tsx`, keys via `app/Keys.tsx`), a world briefing (`banner`: goal + tradeoff, during the countdown), a shape callout ("Press [2] → LONG"), `app/Coach.tsx` (one tutorial tip at a time; each control is introduced when it first matters and is learned for good in `localStorage` `sh_learned` once done; fell / stuck tips repeat; `window.__SH_COACH.reset()`), and the controls card on H (`ControlsList`, shared with the menu). Player‑facing text says "golden object", not "artifact".

**Look (render pipeline).**
- `Scene.tsx`: sky‑built IBL (`SkyEnvironment` PMREMs the painted sky), warm sun with soft PCF shadows that follow `camView`, pink rim light, `DetailCull` (static decor whose on‑screen size is a few pixels is moved to an unrendered layer; the threshold grows on Medium / Low; the mechanisms subtree opts out with `userData.noCull`), then post (`@react-three/postprocessing`): N8AO → Bloom (threshold 1, emissive > 1 only) → saturation → **Neutral** tone mapping → vignette. `render/quality.ts` presets (High / Medium / Low, menu or `?q=`) switch live; Low drops post‑processing and halves shadow resolution. Look‑dev URL flags: `?tm=agx|aces`, `?ao=0`, `?bloom=0`, `?env=0.6`.
- Islands: `islandGeo.ts` builds a flat walkable cap that **exactly** matches the collider outline, a rounded grass rim, layered strata, boulders, spires and leaf drapes; `Islands.tsx` merges all islands per material. `FLUSH` keeps the tower cliff face behind its collider plane (lift + lever). `terrain.ts` holds the grass/cobble shader; cobbled routes come from the `PATHS` mask (world XZ).
- Structures are built with `kit.ts` (bevelled boxes/cylinders with vertex colours, merged per material, Kenney‑matching flat colours): `Structures.tsx` (bridges, palisade, gate towers, stone walls, curbs), `Ch2.tsx` (wind machines, windsocks, receiver cradle, drawbridge, couriers‑only arch), `Ch3.tsx` (tower wall, push lever, crane lift, crooked tower), `Castle.tsx` (Kenney castle storeys + procedural gate), `Dressing.tsx` (airship, dock crane, sacks), `Water.tsx` (waterfalls). All of it follows the LEVEL boxes and adds no colliders.
- `ground.ts` answers "what surface is below (x, z)" from LEVEL data for the blob contact shadows under couriers and the artifact.

**Assets.**
- `public/assets/manifest.json` lists the 85 Kenney GLBs (with bounding boxes) and 30 MP3s. `docs/ASSET_CREDITS.md` has the licenses; everything is CC0, and the fonts are OFL. Quaternius was blocked, so the Kenney Nature Kit is used instead.
- `render/Models.tsx` handles placement:
  - `Model` places one model and `InstancedModel` places many. Both are bottom‑center anchored.
  - Both load with `useGLTF(url, false, false)` so there's no Draco or CDN fetch.
  - Kenney models come at native size (roughly 1 unit per cell). Suggested scales are town ×2–3, castle ×4, nature ×2.5–3.5.
- Every model is wrapped in `SafeBoundary` with a procedural fallback.
- Audio file names are a fixed list in `src/audio/audio.ts`. The `AudioContext` is created only on a user gesture through `sfx.unlock()`. `playMusic` does nothing if that track is already playing; each map picks `music_main` or `music_alt` and a playback rate.

**Dev and test hooks.**
- Opening the page with `?dev` shows a "Solo test room (dev)" button (a 1‑player room).
- `window.__SH_NET.dev({ map: 0..5, warp: <checkpoint index in the current map>, solve: '<mech id>', shape: 0..3, art: [x,y,z], me: [x,y,z], finish: true })` works only when the server isn't production, or when `SH_DEV=1`. `map` restarts the room on that world (single mode, 0.6 s countdown); send other commands after it has started.
- `window.__SH_NET`, `__SH_INPUT.override = {mx, mz, grab, use, sprint}` and `__SH_AUDIO` let tests drive and inspect the game.
- `window.__SH_CAM([x,y,z], [x,y,z])` pins the camera for look‑dev shots (`__SH_CAM(null)` releases it); `window.__SH_GL` is the renderer (draw‑call stats) and `window.__SH_SCENE` the scene.
- `window.__SH_CAMSTATE()` reports the camera (view, yaw / target yaw, pitch, distances, `fpv`, position, direction, up, near, fov, `inSolid`); `window.__SH_LOOK.turn(dx, dy)` / `.zoom(steps)` feed the look input like the mouse would.

## Gotchas learned the hard way

- **Never use convex‑hull colliders for walkable ground.** Bodies sank about 5 cm. Use cuboids (`islandBoxes`).
- **Artifact boxes are `roundCuboid` with `EDGE_R = 0.1`** (half‑extents minus the radius). Sharp boxes snag on the flush seams between bridge decks and islands.
- **Rapier's query structure only updates on `world.step()`.** In tests, step once after `setTranslation` before running shape or ray queries.
- **Friction:** the artifact collider uses the `Min` combine rule, so the per‑shape friction in `shapes.ts` is exact against ground friction 1.0. Couriers use friction 0 with `Min`.
- **Playwright and tsx:** tsx adds `__name` helpers, so pass **strings** to `page.evaluate`, not functions.
- **Network binding:** the server binds `127.0.0.1` by default; set `HOST=0.0.0.0` only behind a real host proxy (as in `render.yaml`). Point tunnels and proxies at `127.0.0.1`, not `localhost`, which can resolve to `::1`.
- **Snapshot time:** `t` in a snapshot is room sim time, which resets each round. `net.onSnap` clears its buffer when time jumps backwards.
- **One NaN pixel whites out the whole screen** through Bloom. With MSAA, varyings can land slightly outside [0, 1], so every `pow(x, y)` in a custom shader must clamp `x` first (clouds, wind ribbons and the goal beam all hit this).
- **`vertexColors: true` needs a `color` attribute.** A geometry without one renders black (the ramp decks did). The terrain and kit materials use vertex colours.
- **Canvas textures sampled in world space need `flipY = false`** (the path mask), otherwise the course paths land on the wrong islands.
- **Visual meshes must stay behind collider planes players press against** (tower face, castle wall front at z = −170). Keep decor out of the lanes; non‑colliding props are walk‑through.
- **R3F does not dispose geometries/materials passed as props.** Anything that remounts per map goes under `<Disposer>`, and the course must never re‑render on a world switch: some course kits (e.g. `Lever` in `Ch3.tsx`, `pivot` is a fresh array) rebuild on every render and leaked ~150 geometries per switch until `MapWorld` memoized the course element. `debug-leak.ts` checks this.
- **Mechanism timing must not depend on countdown length.** Use `playing` / `sim.runTime` for cycles, not `sim.time` (the room steps the sim, not playing, through countdowns). The room‑driven bot run caught this.
- **Snapshots are every other tick** (t ≈ 33/34 ms apart). Tests that compare clients must pick a `t` every client actually received (`commonT` in `net-test2.ts`), not "latest − 66".
- **Playwright's Esc doesn't release pointer lock** (a real browser's Esc does, and may not deliver the key at all). `App.tsx` frees the mouse itself on Esc while locked, and an Esc that only freed the mouse never opens the menu (`look.escFreedMouse`). While locked, every `page.mouse.move` turns the camera, so tests release the lock before mouse moves meant for something else.
- **A quarter turn is exactly ±90° for `axisDiff`**, which folds angles to (−90°, 90°], so LONG's swing direction was a coin flip until the swing used the signed `wrapAngle`.
- **The camera must never lag into a wall:** pull‑in is instant, only easing back out is smoothed; casts from a pivot pressed against a box shrink the sphere for that box (`camCollide.ts`), or the cast would ignore it.
- **The free camera sees the whole course:** draw calls went from ~370 to ~900 in World 1 before `DetailCull`; re‑run `perf.ts` after adding decor.

## Status (as of 2026‑10‑21)

**Working and verified by the scripts above (gameplay expansion on branch `gameplay-expansion`, uncommitted):**
- Six worlds with data‑driven mechanisms, piloting, Q interactions, sprint, bumps/tumbles, crowns, achievements, records, results votes, level select and adventure totals.
- All six worlds beaten by bots with 0 drops, directly and as one full adventure through the `Room`; physics stress tests; socket tests (pilot sync, stale packets, votes, results‑screen rejoin).
- Matchmaking, a 4th player kept out, pause and reconnect, results and the majority vote to the next world in three real Chrome sessions; identical state across them; the production build with no page errors.
- 60 fps in every world on an M4 Pro with the free camera (≈165–750 draw calls on High, ≈160–530 on Low; 0.27–0.81 M triangles); no GPU leak across world switches.
- Per‑player camera (orbit with collision, mouse / touchpad, camera‑relative WASD), first person inside the artifact in every shape, and the plain‑English instructions / tutorial tips (`camera-test.ts`, `camera-three.ts`).

**Remaining:**
1. **Public demo URL.** `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:<port>` failed on the developer laptop with `failed to request quick Tunnel … context deadline exceeded` (cloudflared 2026.10.2 is installed through brew). This is probably the network. The user may host from another laptop, using either the full source or a not‑yet‑built standalone package (bundle the server *without* `--packages=external`, plus a `start.sh`/`start.bat`). Render is the alternative (`render.yaml`, needs the user's account).
2. A real 3‑person test over the public URL, and human playtesting to tune difficulty and feel (par times, spring/puffball strength, clock hand speed, pilot controls, mouse sensitivity, whether the tips are clear to a new player). Only bots and scripts have played so far. A human also needs to confirm the audio by ear, and a real touchpad / mouse needs a feel check (tests synthesize the events).
3. Worlds 4 and 5 visuals and the mechanism visuals are gameplay‑side placeholders built from `kit.ts`; Astra may restyle them (`docs/GAMEPLAY_EXPANSION.md` lists the interfaces).
4. Measure FPS with three clients on a typical (integrated‑GPU) laptop; if it struggles, the Medium/Low presets in the Esc menu are the first lever.

Ask before exposing anything publicly; the user approves each tunnel or deploy. Don't commit unless asked.
