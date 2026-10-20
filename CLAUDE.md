# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SHIFT HAPPENS is a 3‑player online co‑op browser game built for a game jam. Three couriers push and pull one golden artifact through four floating‑island chapters to a castle. The artifact shifts between CUBE, LONG, TALL and ROUND, and each form has a real physical upside and downside.

The product spec and source of truth is `MASTER_PROMPT_FOR_OPUS.md`. Its §13 is the acceptance checklist. `ASSETS_LEVELS_BLUEPRINT.md` covers the level and asset plan, and `REFERENCE_IMAGE.jpg` sets the art direction. `README.md` is the player and developer overview.

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
| `bot-run.ts [safe\|fast]` | nothing | 3 scripted bots play the whole course with normal inputs. The `safe` route finishes in about 147 s with 0 drops. Bots navigate clumsily, so a failure may be bot pathing. Confirm with a focused `debug-*.ts` script. |
| `net-test.ts [url]` | a running server (default `http://127.0.0.1:3000`) | 4 socket clients: 3 matched, 4th isolated, identical snapshots, shift sync, pause |
| `play-three.ts [url] [outPrefix]` | client URL (default Vite `:5173`, or a prod server URL) | 3 Chrome contexts share one room with an identical artifact state |
| `flow-three.ts [url]` | **dev** server (uses the dev `finish` command) | 4th player isolation, disconnect → pause → reload rejoin, results, replay |
| `tour.ts`, `play-solo.ts`, `shot.ts`, `audio-check.ts` | dev server | screenshots of every chapter and the ending in `tests/out/`; audio unlock and decode |

- Playwright drives the installed Google Chrome (`channel: 'chrome'`, headless, `--use-angle=metal`). No browser download is needed.
- After tuning physics or the level, re‑run `sim-test.ts` and `bot-run.ts safe`.

## Architecture (big picture)

**Server‑authoritative, one physics world per room.**
- Call chain: `server/index.ts` (Express + Socket.IO, fixed 60 Hz loop with accumulator) → `matchmaker.ts` (public auto‑match into exactly‑3 rooms, optional room codes, `sessionStorage` session tokens for reconnect) → `room.ts` (phases) → `sim.ts` (the Rapier world).
- Room phases: `waiting → countdown(5 s) → playing ⇄ paused(45 s slot hold) → resuming(3 s) → finished → replay`. Leaving or timing out sends the remaining players back to `waiting` together.
- Clients only send inputs `[seq, mx, mz, jumpCounter, grab, respawnCounter]` at 30 Hz, plus `shift`, `act` and `dev` messages. Clients never simulate physics.

**Shared level data is the single source of truth.**
- `src/shared/level.ts` defines islands (chamfered rects), tagged boxes, kinematic machines (gate, drawbridge, lift, lever), plate and receiver triggers, wind and fan zones, checkpoints, respawn anchors and the goal.
- The server builds colliders from it, using `islandBoxes()` for islands. The client builds visuals from the same data (`render/World.tsx`, `render/islandGeo.ts`), so editing the level moves both.
- `render/Props.tsx` and `render/Scenery.tsx` hold decoration only, with **no colliders**. Keep decor out of the play lanes; the `KEEP` keep‑out rectangles in `Scenery.tsx` do this for procedural foliage.

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
  - The artifact falling below `KILL_Y` resets it to the checkpoint with a 7 s penalty.
  - A courier who falls respawns at the unlocked anchor nearest the artifact.
  - A courier far from the team for 5 s gets "hopped" back.

**Sync and rendering.**
- The server emits a `snap` at 30 Hz with compact arrays (`src/shared/protocol.ts`) and batched reliable `ev` events.
- `src/net/net.ts` keeps a snapshot buffer and a clock‑offset estimate. `frame(delay)` interpolates about 85 ms behind.
- `render/frame.ts` computes **one** `frame.current` per render frame. Your own courier uses a 50 ms delay, and a demo frame stands in on the menu. Every 3D component reads `frame.current` inside `useFrame`. High‑frequency state never goes through React. The zustand `app/store.ts` holds UI state only.
- The morph animation and shift sound fire when the **interpolated** shape changes (`Artifact.tsx`), so the visual swap lines up with the server's collider swap. `GameEvents.tsx` turns events into sound effects, particles (`fx` in `Effects.tsx`), toasts and chapter banners.
- `render/objective.ts` returns the current point of interest. `app/WorldLabels.tsx` uses it for the in‑world hint, and `CameraRig.tsx` uses it to frame the next objective. Labels are DOM elements projected through `camRef`; drei `<Html>` was removed because it caused React root‑unmount errors.
- `CameraRig.tsx` has three modes: menu (cinematic), follow (bounding‑box fit of the artifact and couriers at a fixed 41° pitch and fixed yaw, so W is always −Z), and the ending cutscene (`Ending.tsx`: the King uses the artifact as a doorstop, then results appear).

**Assets.**
- `public/assets/manifest.json` lists the 73 Kenney GLBs (with bounding boxes) and 30 MP3s. `docs/ASSET_CREDITS.md` has the licenses; everything is CC0, and the fonts are OFL. Quaternius was blocked, so the Kenney Nature Kit is used instead.
- `render/Models.tsx` handles placement:
  - `Model` places one model and `InstancedModel` places many. Both are bottom‑center anchored.
  - Both load with `useGLTF(url, false, false)` so there's no Draco or CDN fetch.
  - Kenney models come at native size (roughly 1 unit per cell). Suggested scales are town ×2–3, castle ×4, nature ×2.5–3.5.
- Every model is wrapped in `SafeBoundary` with a procedural fallback.
- Audio file names are a fixed list in `src/audio/audio.ts`. The `AudioContext` is created only on a user gesture through `sfx.unlock()`. `playMusic` does nothing if that track is already playing; chapter 4 switches to `music_alt`.

**Dev and test hooks.**
- Opening the page with `?dev` shows a "Solo test room (dev)" button (a 1‑player room).
- `window.__SH_NET.dev({ warp: 0..3, shape: 0..3, art: [x,y,z], me: [x,y,z], finish: true })` works only when the server isn't production, or when `SH_DEV=1`.
- `window.__SH_NET`, `__SH_INPUT.override = {mx, mz, grab}` and `__SH_AUDIO` let tests drive and inspect the game.

## Gotchas learned the hard way

- **Never use convex‑hull colliders for walkable ground.** Bodies sank about 5 cm. Use cuboids (`islandBoxes`).
- **Artifact boxes are `roundCuboid` with `EDGE_R = 0.1`** (half‑extents minus the radius). Sharp boxes snag on the flush seams between bridge decks and islands.
- **Rapier's query structure only updates on `world.step()`.** In tests, step once after `setTranslation` before running shape or ray queries.
- **Friction:** the artifact collider uses the `Min` combine rule, so the per‑shape friction in `shapes.ts` is exact against ground friction 1.0. Couriers use friction 0 with `Min`.
- **Playwright and tsx:** tsx adds `__name` helpers, so pass **strings** to `page.evaluate`, not functions.
- **Network binding:** the server binds `127.0.0.1` by default; set `HOST=0.0.0.0` only behind a real host proxy (as in `render.yaml`). Point tunnels and proxies at `127.0.0.1`, not `localhost`, which can resolve to `::1`.
- **Snapshot time:** `t` in a snapshot is room sim time, which resets each round. `net.onSnap` clears its buffer when time jumps backwards.

## Status (as of 2026‑10‑20)

**Working and verified by the scripts above:**
- Matchmaking, a 4th player kept out, pause and reconnect, all 4 chapters and the ending, results and replay.
- Identical state across three Chrome sessions.
- All 4 forms and their tradeoffs.
- Audio: music plus 28 sound effects, and mute.
- Kenney art.
- The production build, with no page errors.

**Remaining:**
1. **Public demo URL.** `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:<port>` failed on the developer laptop with `failed to request quick Tunnel … context deadline exceeded` (cloudflared 2026.10.2 is installed through brew). This is probably the network. The user may host from another laptop, using either the full source or a not‑yet‑built standalone package (bundle the server *without* `--packages=external`, plus a `start.sh`/`start.bat`). Render is the alternative (`render.yaml`, needs the user's account).
2. A real 3‑person test over the public URL, and human playtesting to tune difficulty and feel. Only bots and scripts have played so far. A human also needs to confirm the audio by ear.
3. Write `docs/TEST_CHECKLIST.md` with evidence for each item in §13 of the master prompt.
4. Measure FPS with three clients on a typical laptop. A single headless client renders at about 60 fps on an M4 Pro.

Ask before exposing anything publicly; the user approves each tunnel or deploy. Don't commit unless asked.
