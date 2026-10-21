# SHIFT HAPPENS

**Three friends. One shape. Many problems.**

A 3‑player online co‑op physics game in the browser. Three tiny royal couriers must haul a giant, shape‑shifting golden artifact through six floating‑island worlds to the King's castle. Every shape helps in one way and hurts in another, one courier can hop *inside* the artifact and drive it, and the worlds are full of springs, wind, wobbly bridges, clockwork, carts and cranes. (The King uses it as a doorstop.)

- Exactly 3 players per room, automatic matchmaking, optional room code, no sign‑up.
- One authoritative Rapier physics world per room on the Node server. Clients only send inputs and render interpolated snapshots, so all three players always see the same artifact.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev      # server on :3000 + Vite client on http://localhost:5173 (dev tools on)
npm run build    # production client (dist/client) + bundled server (dist/server)
npm start        # production: serves everything on http://127.0.0.1:3000
```

- `PORT` changes the port.
- The server binds to loopback by default. Set `HOST=0.0.0.0` only on a real host behind its own proxy (see `render.yaml`).
- The repo's `.npmrc` points at the public npm registry.

To play, open the URL in three browser windows or on three machines, then press **PLAY** in each. The first three players form a room, and a fourth player starts the next room. To guarantee friends end up together, all three enter the same **room code**.

In the lobby, each player picks a world from the six pictures (or **All six in a row**). When two of the three pick the same one, it starts. If all three pick differently, one of the three picks is drawn after 5 seconds.

## Controls

| Key | Action |
|---|---|
| Mouse / touchpad | look around: click the game to capture the mouse (Esc frees it), or drag with a button held. Two‑finger sideways swipe also turns |
| Scroll / pinch | zoom the camera in and out |
| WASD / arrows | move, relative to where your camera looks |
| Space | jump |
| Shift (hold) | sprint (faster, less grip) |
| **E** (hold) | grip a rope on the artifact and pull |
| **F** | hop inside the artifact / hop back out (one pilot at a time) |
| **Q** | use the nearest lever, valve, crank, wheel or button (some must be held) |
| **1 2 3 4** | shift to CUBE / LONG / TALL / ROUND (near the artifact or from inside; shared 1.5 s cooldown) |
| R | hop back next to your team (inside the artifact: bail out) |
| T | vote to recall the artifact to the last checkpoint (2 votes; +7 s, free when it's stuck) |
| V | inside the artifact: switch between first person and an outside view (scrolling out / all the way in does the same) |
| H | controls card (also the **? H** button), with this world's goal and tradeoff |
| Esc | free the mouse; again: menu (volume, mouse speed, invert mouse, quality, mute, leave) |
| M | mute |

## The four shapes (all one rigid body with one collider)

| Shape | Upside | Downside | Piloted: WASD · Space |
|---|---|---|---|
| CUBE 2×2×2 | stable, pushes steadily, ignores wind | too tall for the low arch, can't fit the receiver | scoot · **Hop** (onto ledges) |
| LONG 4.7×0.76×1.1 | slides under the low arch, slots into the receiver, bridges gaps | turns slowly; gusts spin it and slide it toward the edge | nudge · **Swing** 90° |
| TALL 1.1×4.4×1.1 | reaches the high lever | top‑heavy; wobbles and tips unless **two** couriers hold E | waddle + lean · **Brace** |
| ROUND r 1.05 | rolls down the castle chute faster than anything | hard to stop; wind and fans blow it away | roll (steer back to brake) · **Boost** |

**Camera.** Every player has their own third‑person camera around their courier. It never passes through level geometry (it is pulled in instead), and decorations between it and you get a see‑through hole. A new world starts facing down the course.

**Piloting.** Stand next to the artifact and press F. The camera moves inside it: first person with mouse look, a golden frame that fits the shape, and the view kept level (ROUND's cage rolls around you). WASD drives it toward where you look with the current shape's movement, Space is the shape's ability (LONG: hold A or D to pick the way it turns), 1–4 still shift, and the others can keep pushing and pulling. Everyone else still sees the artifact with your face in its little dome. Hopping out picks a safe spot beside the artifact (ground below, room to stand, no walls in between). If there isn't one, or the artifact is moving too fast, the game keeps trying for a few seconds; R always bails you out to the nearest safe spot.

## The six worlds (each built for about 2–4 minutes)

1. **Royal Loading Dock** (learn to cooperate). Push onto the heavy plate to open the gate, shift to LONG under the low arch while a turnstile sweeps the lane, then hop inside as CUBE and Hop it onto the loading dock. A spring pad flings couriers (or the artifact) over the arch wall.
2. **Windbridge Cliffs** (control versus speed). A wobbly, wind‑rocked rope bridge, a valve that calms the cliff wind but turns on a gust gauntlet, LONG into the glowing cradle to lower the drawbridge, then hug the windbreaks.
3. **The Crooked Clockwork Tower** (stability versus freedom). Ride the rotating clock hand across while someone holds the hub brake, steady TALL against the high lever, then load the lift, crank it, and release its brake from the top.
4. **Mushroom Mayhem** (momentum versus precision). Bouncy mushrooms launch couriers and the artifact, slippery moss, a puffball that blows everyone away, and the Giant Bounce: aim it and pump it with Q to fling the artifact to the village, or ride the bobbing caps.
5. **Sky Railway Disaster** (coordination under pressure). Push the artifact into a mine cart, pull Depart, set the junction to the SAFE loop or the EXPRESS catapult, then work the crane (let go mid‑swing to fling it onto the mesa).
6. **Castle Dash** (everything you've learned). Choose the safe switchback or the chaos chute past the fan, then two couriers hold the royal plates while the third brings the artifact through the portcullis. Ends with the King's cutscene.

**Recovery.** Checkpoints sit inside each world. If the artifact falls, it and the team respawn at the checkpoint (+7 s). A courier who falls respawns next to the team. If the artifact gets stuck, recalling it (T) is free, and if it wanders off the map it comes back by itself. Machines that could trap it (the lift, the cart, gates) reset or wait for it.

**Scoring.** Each world gives up to three crowns: delivered, under par time, and every royal stamp found. Score adds a time bonus under par, stamps, shortcuts and a clean‑run bonus, and subtracts drops and tumbles. Shape shifts are never penalized. Best times and crowns are saved in the browser. After each world, two of the three players vote to retry it or pick any world (or the next one, when playing all six in a row, which ends with a total).

## Architecture

```
server/index.ts       Express + Socket.IO, fixed 60 Hz loop with accumulator
server/matchmaker.ts  auto-match into 3-slot rooms, room codes, session-token reconnect
server/room.ts        waiting → countdown → playing ⇄ paused (45 s hold) → finished (results + votes) → next world
server/sim.ts         Rapier world for one map: courier capsules, artifact body, grip ropes, shifts, checkpoints
server/mechs.ts       data-driven mechanisms (plates, gates, wind, springs, rotors, wobble bridges, cart, crane, …)
server/pilot.ts       riding inside the artifact: occupancy, safe exits, per-shape steering and abilities
src/shared/maps/      the six worlds as data (islands, checkpoints, mechanisms, objectives, par, music)
src/shared/           original course level data, shapes, protocol (the same source for colliders and visuals)
src/net/              socket client, snapshot buffer + interpolation, keyboard input
src/render/           R3F scene: islands, machines, mechanisms, artifact morph, couriers, camera, FX, ending
src/app/              landing, lobby, HUD, results, menu (React DOM)
```

- **Physics.** One dynamic body for the artifact. A shift swaps its single collider in place: it checks clearance against the static world, aligns the bottom to the floor, and moves couriers who would be inside the new shape onto safe ground.
- **Networking.** Clients send inputs at 30 Hz. The server steps at 60 Hz and broadcasts snapshots at 30 Hz. Clients render about 85 ms in the past and interpolate; your own courier uses about 50 ms. Reliable events drive sounds, toasts and effects.
- **Disconnects.** If a player drops, the run pauses for up to 45 s and holds their slot for their session token. Reconnecting resumes after a 3 s countdown. If they don't return, the other two go back to the lobby together.

## Tests (all scripted, run against real code)

```bash
npx tsx tests/sim-test.ts             # headless physics: push scaling, grips, shifts, arch, plate, wind per shape, lever
npx tsx tests/pilot-test.ts           # piloting: entry/exit rules, safe exits, every shape's controls and ability
npx tsx tests/mushroom-test.ts        # springs, puffball, Giant Bounce aim + pump
npx tsx tests/stress-test.ts          # shift spam, fast ROUND into walls, long rides, crane with a pilot, out of bounds
npx tsx tests/bot-run.ts safe         # 3 scripted couriers beat all six worlds with normal inputs only (also: fast)
npx tsx tests/bot-run.ts safe --room  # the same, as one full adventure through the server Room (inputs, votes, totals)
npx tsx tests/net-test.ts             # 4 socket clients: 3 matched, 4th isolated, identical state, shift sync, pause
npx tsx tests/net-test2.ts            # pilot sync, stale/malformed packets, identical mechanisms, results votes + drop
npx tsx tests/play-three.ts           # 3 real Chrome sessions: shared room, identical artifact state, shift seen by all
npx tsx tests/flow-three.ts           # browsers: 4th isolated, disconnect→pause→reload rejoin, results, vote → World 2
npx tsx tests/camera-test.ts          # camera: mouse/touchpad turn + zoom, WASD per camera, walls, first person per shape
npx tsx tests/camera-three.ts         # 3 browsers: independent cameras, one rides in first person, others unaffected
npx tsx tests/perf.ts                 # FPS, draw calls, triangles in every world (dev server)
npx tsx tests/tour.ts                 # screenshots of every world + ending (dev server)
npx tsx tests/thumbs.ts               # regenerate the lobby's world pictures (public/assets/worlds/, dev server)
```

The browser and socket tests use the installed Google Chrome through Playwright (`channel: 'chrome'`). Pass a URL as the first argument to test a production or public server.

## Public demo

- **Quick, no hosting account.** Run `npm start`, then `cloudflared tunnel --url http://127.0.0.1:3000`, and share the `https://*.trycloudflare.com` link. The link changes on every restart, and the hosting machine must stay online.
- **Persistent.** Render free web service using `render.yaml`. This needs the developer to create a Render account. Free instances sleep when idle, so open the URL once before a demo.

## Assets

All third‑party assets are CC0 (Kenney kits, OpenGameArt music) or OFL (Fredoka and Nunito fonts). They're bundled locally, so nothing is fetched at runtime. Sources and licenses are in [`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md). The couriers, the artifact, the islands, the machines, the castle and the King are procedural.
