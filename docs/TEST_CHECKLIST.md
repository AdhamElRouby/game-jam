# Acceptance checklist with evidence

Every result below comes from a script that was actually run on 2026‑10‑21 (branch `gameplay-expansion`, M4 Pro,
Chrome via Playwright, servers on loopback). "Not done" items have not been verified and still need a person.

Servers used: dev = `PORT=3210 tsx watch server/index.ts` + Vite on `127.0.0.1:5310`; prod = `npm run build` then
`NODE_ENV=production node dist/server/index.js` on `127.0.0.1:3220`.

## Master prompt §13

| Item | Status | Evidence |
|---|---|---|
| Public/working browser landing page with local PLAY | Local: done. Public URL: **not done** | Landing + PLAY drive every browser test below. No public URL yet: an earlier quick tunnel failed on this network, and exposing it needs the user's go‑ahead. |
| 3 tabs share one room and physics state; a fourth does not invade | Done | `net-test.ts` (dev and prod): ALL NET CHECKS PASSED. `play-three.ts` (dev and prod): one room, identical artifact state at the same tick on all three. `flow-three.ts`: the 4th player gets a different, waiting room. |
| Three avatars independently controllable and distinct | Done | `play-three.ts` drives each slot separately; screenshots `tests/out/three-*.png`, `gal-*.png` (red/blue/green couriers with different hats). |
| Pushing and E grip work; all four forms collide properly | Done | `sim-test.ts`: ALL CHECKS PASSED (push with 1/2/3 couriers, grip, every shift, arch, plate, wind per shape, lever, chute). `stress-test.ts`: no tunnelling or embedding. |
| Shape changes visible to everyone at once | Done | `net-test.ts`: shift to LONG seen by all three; `play-three.ts`: shape 1 on every client at the same tick. |
| ≥ 3 puzzles with real tradeoffs and a finish gag | Done | Six worlds, each with 2–4 encounters (see `README.md`). `bot-run.ts` solves all of them; the King's doorstop cutscene: `tests/out/gal-ending-6s.png`. |
| Recoverable resets/checkpoints, no permanent softlocks | Done | `stress-test.ts` (20 recalls while gripped, out‑of‑bounds auto recall, crane with a pilot), stuck → free recall, lift returns for the artifact, cart re‑parks on recall. Bots finish every world with 0 drops. |
| Attractive warm fantasy world, clear camera | Done (screenshots) | `gallery.ts` and `tour.ts` beats for all six worlds + ending in `tests/out/gal-*.png`, `tour-*.png`. Taste needs a human look. |
| Music loops, ≥ 8 SFX events, mute works | Done in code; **by ear not done** | `audio-check.ts`: AudioContext running, 29–30 buffers decoded, `music_main` → `music_alt` in World 3, no audio warnings. 28 CC0 SFX + procedural `synth.ts` sounds are wired to events in `GameEvents.tsx`. A person still has to listen. |
| Intro/lobby/tutorial/results/replay, no login | Done | `flow-three.ts`: countdown, HUD, pause overlay, results with crowns + achievements, a single vote waits, the majority starts World 2. |
| `npm run build` passes; no blocking console/server errors | Done | `npm run build` OK (client 1.82 MB / 548 kB gzip, server 170.7 kB). `npm run typecheck` clean. Browser tests report "no page errors". `prod-dev-off.ts`: dev commands ignored in production. |
| Screenshots/video, public URL, run commands | Screenshots + commands: done. Public URL: **not done** | `tests/out/`, `README.md` (Run it, Tests). |

## Expansion brief, Part 17

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Three players can join and play online | Done (loopback) | `net-test.ts`, `play-three.ts`, `flow-three.ts` on dev and prod builds. Not yet tested across real machines. |
| 2 | Shared physics stays synchronized | Done | Identical artifact state (`play-three.ts`), identical mechanism state for 38 mechanisms and identical cart state (`net-test2.ts`). |
| 3 | The artifact can be piloted safely | Done | `pilot-test.ts`: ALL PILOT CHECKS PASSED (entry rules, one pilot, safe exits, retries, bail, disconnect/reset). `pilot-browser.ts`: F in, WASD steers 1.74 m, Space hop, shift from inside, F out beside it. `stress-test.ts`: no hopping out high under the crane hook. |
| 4 | Four shapes behave meaningfully differently | Done | `sim-test.ts` per‑shape checks; per‑shape pilot moves and abilities in `pilot-test.ts`. |
| 5 | Push, pull, stabilize, enter, exit, interact | Done | `sim-test.ts` (push, grip, TALL steadied by two), `pilot-test.ts` (enter/exit), `bot-run.ts` (Q levers, valve, crank, crane, junction, pump). |
| 6 | Interactive hazards work | Done | `mushroom-test.ts` (springs, puffball, Giant Bounce aim + pump): ALL MUSHROOM CHECKS PASSED; wind, turnstile, clock hand, wobble bridge exercised in `bot-run.ts` and `stress-test.ts`. |
| 7 | Puzzles need real cooperation | Done (by design, bot‑verified) | Two‑on‑plates royal gate, hub brake + loaders, two steadying TALL, lift crank + brake, cart lever + riders, crane operator. Bots need all three couriers to finish. |
| 8 | Strategic tradeoffs | Done | Safe vs chaos routes (W6), SAFE loop vs EXPRESS catapult (W5), valve calms wind but opens the gauntlet (W2), caps vs Giant Bounce (W4); `bot-run.ts safe` and `fast` both finish. |
| 9 | Distinct mechanics per level | Done | See `README.md` worlds list and the mechanism kinds per map. |
| 10 | Multiple fully playable maps | Done | `bot-run.ts safe`: all 6 finished, 0 drops (W1 50.2 s, W2 50.0 s, W3 125.3 s, W4 76.7 s, W5 83.5 s, W6 58.3 s). `fast`: all 6 (W5 55.2 s express, W6 52.0 s with 3 crowns). |
| 11 | Checkpoints and recovery are reliable | Done | Grounded‑only checkpoints, recalls, auto recall, respawns (`stress-test.ts`, `bot-run.ts` logs). |
| 12 | No common action permanently traps players | Done (tested cases) | Gates won't close on bodies, exits validated + bail, lift return, cart re‑park, stuck → free recall, blockers at map exits. Untested human creativity remains a risk. |
| 13 | Responsive and playable in the browser | Done on this machine | `perf.ts` (free camera): 60 fps in every world at the start and a later checkpoint, 165–749 draw calls on High (Low: 528 in World 1), 0.27–0.81 M triangles (before the free camera: 164–458 calls). `debug-leak.ts`: GPU counts flat across repeated world switches. Server step 0.05 ms/room (`stress-test.ts`). Integrated‑GPU laptop **not measured**. |
| 14 | Scoring rewards teamwork and skill | Done | Crowns (delivered, under par, all stamps), time bonus, stamps, shortcuts, clean run; shifts never penalized. Results screens: `tests/out/flow-results.png`, `gal-results.png`. |
| 15 | Music and SFX integrated | Done in code; by ear **not done** | `audio-check.ts` (see above), per‑world music and rate. |
| 16 | Level transitions and results synchronize | Done | `flow-three.ts` (vote → World 2 on all clients, timer reset); `net-test2.ts` (invalid votes ignored, no switch while a teammate is missing, rejoin on the results screen, majority executes); `bot-run.ts --room` (votes between all six worlds). |
| 17 | Existing features remain intact | Done | Original `sim-test.ts`, `net-test.ts`, `play-three.ts`, `flow-three.ts` all pass; the castle ending still plays. |
| 18 | Astra's visual work not overwritten | Done | Camera pass (2026‑10‑21) touched art files only where the free camera needed it: `Artifact.tsx` (shell hidden for the local first‑person view), `Models.tsx` (decor see‑through patch in `harmonize`), `World.tsx` (`Fade` uses the camera → focus line instead of "camera at +Z"), `Players.tsx` / `Pilot.tsx` (hide your own courier / dome when the camera is in them). Otherwise the art files (islands, structures, Ch2/Ch3, castle, dressing, water, terrain, kit, effects, ending, quality) are unmodified. The shared render glue got targeted changes (`World.tsx` map‑aware goal and checkpoints, `Players.tsx` pilot/tumble poses, `ground.ts` per‑map surfaces, `objective.ts`, `CameraRig.tsx` 3 lines, `Scene.tsx`, `Scenery.tsx` 1 line, `frame.ts`). New visuals live in new files (`Mechanisms.tsx`, `MapWorld.tsx`, `Disposer.tsx`, `Pilot.tsx`, `worlds/`). Interfaces in `docs/GAMEPLAY_EXPANSION.md`. |
| 19 | Three‑player complete‑run tests pass | Done (scripted) | `bot-run.ts safe --room`: one adventure through the server Room with three members, input packets, votes: 6 worlds, 0 drops, 12/18 crowns, 458.8 s, history in all three lobbies. `fast --room`: 13/18 crowns, 417.1 s. No human three‑person run yet. |
| 20 | Entertaining, playful, replayable | **Not verifiable by script** | Needs human playtests. |

## Camera, first person and instructions (2026‑10‑21)

Servers: dev = `PORT=3300 tsx watch server/index.ts` + `SH_SERVER=http://127.0.0.1:3300 vite --port 5180`; prod build in
a temp folder on `127.0.0.1:3400`.

| Item | Status | Evidence |
|---|---|---|
| Independent third‑person camera per player, mouse + touchpad | Done | `camera-test.ts`: drag turns right/left and tilts, wheel zooms out/in, touchpad sideways swipe turns, pinch zooms, pointer lock engages on click and Esc frees it without opening the menu. `camera-three.ts`: each of three players turns / zooms only their own camera. |
| WASD relative to the camera | Done | `camera-test.ts`: W/D/A/S in 3 headings walk the right world direction (≈3.8 m each). `camera-three.ts`: W walks where each player's own camera faces. |
| Smooth follow, no clipping | Done | `camera-test.ts`: frame‑to‑frame camera velocity change ≤ 0.75 m/s while walking, a 0.6 rad flick spread over frames (max 0.14 rad/frame), pulled in on your side of the palisade, below the low arch's ceiling, 0 of 580 frames inside level geometry in fast 360° sweeps at five spots. Decor gets a see‑through hole (screenshot `cam3-ride-0.png`). |
| First person inside the artifact, every shape | Done | `camera-test.ts`: F puts the camera inside (seat height per shape: CUBE +0.25, LONG +0.08, TALL +1.45 along the pillar, ROUND +0.1), mouse look, W drives toward the view, ROUND rolls 3 m with the view level (up.y ≥ 0.996), LONG's A + Space turns left with the camera at 0° and 90° (`pilot-test.ts`: A/D left/right at both headings). V and scrolling switch to the outside view and back; F returns smoothly to third person. Screenshots `cam-fp-*.png`. |
| Others still see the artifact normally | Done | `camera-three.ts`: the rider is in first person, the other two stay in third person with the shell visible (`cam3-ride-*.png`, `cam3-round-*.png`), identical artifact state on all three, a shape change from inside reaches everyone. |
| Transitions: shape changes, collisions, falling, respawn, reconnect, level change | Done | `camera-test.ts`: still inside after each shift; falling keeps the camera up (courier at −13 m, camera ≥ −0.6 m) then cuts to the respawn; the artifact falling with a pilot puts you outside with the camera behind you; a new world resets the heading; a reload rejoins with a working camera. `camera-three.ts`: one player's reload leaves the others' cameras alone. |
| Clear instructions, gradual tips, highlights, keys shown, help any time | Done (by script); clarity to new players **needs a human** | Every objective rewritten (text + tip with key caps), a goal + tradeoff briefing per world, shape callouts, a ring / light column / arrows on what to use, edge arrows for off‑screen targets, one‑at‑a‑time tips that are learned once done, an H controls card. Reviewed in screenshots of every world and checkpoint. |
| Nothing else broke | Done | `sim-test`, `pilot-test` (37), `stress-test`, `mushroom-test` all pass; `bot-run.ts safe` / `fast` / `safe --room` finish all six worlds, 0 drops; `net-test`, `net-test2`, `play-three`, `flow-three` pass on dev; `prod-dev-off` + `play-three` pass on the production build; no page errors. |

## Still open

1. Public URL and a real three‑person session over it (needs the user's approval to expose anything).
2. Human playtesting for difficulty and feel; audio checked by ear.
3. FPS with three clients on an integrated‑GPU laptop (the free camera shows more of the world; Medium / Low cull more decor).
4. A feel check with a real mouse and a real touchpad (the tests synthesize the input events).
