# SHIFT HAPPENS

**Three friends. One shape. Many problems.**

A 3‑player online co‑op physics game in the browser. Three tiny royal couriers must haul a giant, shape‑shifting golden artifact across four floating‑island chapters to the King's castle. Every shape helps in one way and hurts in another. (The King uses it as a doorstop.)

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

## Controls

| Key | Action |
|---|---|
| WASD / arrows | move |
| Space | jump |
| **E** (hold) | grip a rope on the artifact and pull |
| **1 2 3 4** | shift to CUBE / LONG / TALL / ROUND (must be near the artifact; shared 1.5 s cooldown) |
| R | hop back next to your team |
| T | vote to recall the artifact to the last checkpoint (2 votes, +7 s) |
| Esc | menu (music / SFX volume, mute, leave) |
| M | mute |

## The four shapes (all one rigid body with one collider)

| Shape | Upside | Downside |
|---|---|---|
| CUBE 2×2×2 | stable, pushes steadily, ignores wind | too tall for the low arch, can't fit the receiver |
| LONG 4.7×0.76×1.1 | slides under the low arch, slots into the receiver | turns slowly; gusts spin it and slide it toward the edge |
| TALL 1.1×4.4×1.1 | reaches the high lever | top‑heavy; wobbles and tips unless **two** couriers hold E |
| ROUND r 1.05 | rolls down the castle chute faster than anything | hard to stop; the big fan blows it off the chute |

## The Golden Road (about 3–5 minutes)

1. **Royal Loading Dock.** Push the artifact onto the pressure plate to open the gate, then shift to LONG to fit under the low arch.
2. **Windbridge Cliffs.** Gusts blow toward the open edge. Lay LONG in the glowing receiver to lower the drawbridge, and cross it as CUBE to stay put in the wind. Couriers have their own catwalk.
3. **The Crooked Tower.** A steadied, upright TALL pillar throws the high lever. Then everyone and the artifact ride the lift.
4. **Castle Dash.** Take either the safe railed road (CUBE) or the fast fan chute (ROUND). All three couriers and the artifact must hold inside the golden ring for 1.5 s.

Checkpoints sit between chapters. If the artifact falls, it and the team respawn at the checkpoint with a 7 s penalty. A courier who falls respawns next to the team.

Score = 1200 − 2 × seconds − 35 × drops − 10 × tumbles, shown with a rating of 1–3 crowns.

## Architecture

```
server/index.ts       Express + Socket.IO, fixed 60 Hz loop with accumulator
server/matchmaker.ts  auto-match into 3-slot rooms, room codes, session-token reconnect
server/room.ts        waiting → countdown → playing ⇄ paused (45 s hold) → finished → replay
server/sim.ts         Rapier world: courier capsules, artifact body, grip ropes, shifts, puzzles
src/shared/           level data (the same source for colliders and visuals), shapes, protocol
src/net/              socket client, snapshot buffer + interpolation, keyboard input
src/render/           R3F scene: islands, machines, artifact morph, couriers, camera, FX, ending
src/app/              landing, lobby, HUD, results, menu (React DOM)
```

- **Physics.** One dynamic body for the artifact. A shift swaps its single collider in place: it checks clearance against the static world, aligns the bottom to the floor, and moves couriers who would be inside the new shape onto safe ground.
- **Networking.** Clients send inputs at 30 Hz. The server steps at 60 Hz and broadcasts snapshots at 30 Hz. Clients render about 85 ms in the past and interpolate; your own courier uses about 50 ms. Reliable events drive sounds, toasts and effects.
- **Disconnects.** If a player drops, the run pauses for up to 45 s and holds their slot for their session token. Reconnecting resumes after a 3 s countdown. If they don't return, the other two go back to the lobby together.

## Tests (all scripted, run against real code)

```bash
npx tsx tests/sim-test.ts      # headless physics: push scaling, grips, shifts, arch, plate, wind per shape, lever
npx tsx tests/bot-run.ts safe  # 3 scripted couriers beat the whole course with normal inputs only
npx tsx tests/net-test.ts      # 4 socket clients: 3 matched, 4th isolated, identical state, shift sync, pause
npx tsx tests/play-three.ts    # 3 real Chrome sessions: shared room, identical artifact state, shift seen by all
npx tsx tests/flow-three.ts    # browsers: 4th isolated, disconnect→pause→reload rejoin, finish, results, replay
npx tsx tests/tour.ts          # screenshots of every chapter + ending (dev server)
```

The browser tests use the installed Google Chrome through Playwright (`channel: 'chrome'`). Pass a URL as the first argument to test a production or public server.

## Public demo

- **Quick, no hosting account.** Run `npm start`, then `cloudflared tunnel --url http://127.0.0.1:3000`, and share the `https://*.trycloudflare.com` link. The link changes on every restart, and the hosting machine must stay online.
- **Persistent.** Render free web service using `render.yaml`. This needs the developer to create a Render account. Free instances sleep when idle, so open the URL once before a demo.

## Assets

All third‑party assets are CC0 (Kenney kits, OpenGameArt music) or OFL (Fredoka and Nunito fonts). They're bundled locally, so nothing is fetched at runtime. Sources and licenses are in [`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md). The couriers, the artifact, the islands, the machines, the castle and the King are procedural.
