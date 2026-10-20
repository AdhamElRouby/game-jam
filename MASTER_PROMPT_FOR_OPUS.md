# SHIFT HAPPENS — MASTER BUILD PROMPT FOR OPUS 5.5

**Use this entire document as an implementation instruction, not a brainstorming request.**

You are the lead gameplay, networking, and technical artist engineer for **SHIFT HAPPENS**, a polished, cheerful, 3D browser-based game-jam entry for **exactly 3 online human players**. You have less than 24 hours of wall-clock development time. Your mission is to BUILD, RUN, TEST, POLISH, and MAKE THE GAME ACCESSIBLE THROUGH A WEB URL, not simply describe a design. Prioritize a functioning, beautiful and fun 3-player game over feature breadth. You may delegate environment assets or scene visual work to Astra if available, but stay responsible for integration and a fully running result.

## 0 — Nonnegotiable success criteria

1. Three remote human players can open **the same URL**, enter optional nicknames, click PLAY, and automatically be placed together in the first available **exactly 3-player** room. No signup, login, external app, or accounts are required for players. An **optional invite room code** should allow three friends to guarantee they're matched together if public traffic exists.
2. On the third arrival, show a 5-second countdown and load **one shared synchronized game session**. Each player controls a distinct RED, BLUE, or GREEN charming character. Every player can see the other players and the same yellow shape-shifting artifact.
3. Cooperative movement works. Players push the heavy artifact, hold E near it to grip and help pull it, and can independently walk/jump. The artifact has four properly colliding forms: CUBE, LONG, TALL, ROUND. Shared changes must agree on all clients.
4. The team must transport the artifact through a **coherent, delightful, playable, approximately 4-minute fantasy obstacle course** ending at a king's castle. The path includes at least THREE meaningful physics/tradeoff puzzles. The theme of TRADEOFF must be evident during play, not just in a description.
5. The result **looks intentionally polished**: lush floating islands, warm blue sky, miniature fantasy village/castle silhouettes, clean rounded characters, stylized golden artifact, grass, rocks, trees, bridges, waterfalls/clouds, soft lighting, atmospheric haze, readable camera, and restrained VFX. Avoid a gray prototype.
6. **Pleasant looping background music AND at least eight working event-specific sound effects** are integrated, respecting browser audio unlocking and licensed usage. A mute and volume UI must work.
7. The game has a welcoming landing screen, 3-person matchmaking lobby, concise controls overlay, countdown, checkpoints, score/results screen, replay, and graceful disconnect handling. The total experience is understandable without reading a long explanation.
8. Run locally, verify THREE simultaneous independent sessions (three tabs at minimum, ideally real machines), build production output, make a stable public demo URL available or clearly identify any external-credentials blocker. Do not claim deployment/testing occurred when it did not.

## 1 — High concept and tone

Title: **SHIFT HAPPENS**. Tagline: **Three friends. One shape. Many problems.**

Story: The king has requested delivery of a giant magical golden royal artifact. Three hilariously incompetent, tiny couriers are charged with getting it across dangerous floating islands to the castle before the king's ceremony. The final gag: the king uses this majestic magical artifact as a DOORSTOP. The plot should be conveyed via one playful illustrated start panel and a 6–10 second end cutscene; no dialogue system.

Emotional target: friends shouting "go left!", one accidentally shifting it into a sphere, the object rolling downhill, everyone scrambling to catch it. **Charming and controlled chaos**. Do not overwhelm the playfield with decorative objects, UI panels, particles, or noise. Two levels of visual hierarchy: artifact and players are foremost, obstacles second, scenery third. The reference is a bright toy-diorama fantasy world; it is concept art, not a promise of cinematic real-time quality.

Gameplay loop: maneuver object -> see physical obstacle -> cooperate -> choose shape with visible upside/downside -> avoid a comical mishap -> pass checkpoint -> reach castle. Minimize menus and crafting, inventories, skill trees, health bars, weapons, enemies, and unrelated gameplay systems.

## 2 — Controls and rules

- Desktop keyboard: WASD/arrow keys move; SPACE jump; HOLD E near artifact to grab/pull/support; release E to let go. Near simple switches E interacts. Keys 1–4 request CUBE/LONG/TALL/ROUND transformations when within a short range. Esc menu/audio controls. Optional SHIFT sprint: faster travel but considerably less stable while holding object (only implement if polished).
- Any attached/nearby player may request a transformation; server checks proximity, 1.5-second shared cooldown, and safe shape-change clearance; send one synchronized transformation event to all clients. Indicate rejected changes with a tiny "No room to shift!" message and dull thunk. Never allow shape-spam through key-repeat.
- The artifact must be able to move through the world under believable but forgiving physics. Apply bounded spring/tether forces when player grips; players must cooperate and tug from different directions. Visible arms/short stretchy grab ropes may signal attachment, but do not make controls physically punishing.
- The object can tumble or tip but should not get permanently trapped. If it falls into the sky, reset object and players to most recent checkpoint with a funny bounce/poof and a small time penalty (~7 s).
- No friendly fire. Players should not be able to permanently block each other, pin the artifact through a wall, or destroy the run intentionally with one button. The object is the shared focal point.
- Three characters should be visually distinct by red/blue/green colors AND subtle hats/accessories; animate simple foot steps, body tilt, eye motion, and squash on jumping/falling. Procedural chibi meshes are preferable to style-incompatible stock characters.

## 3 — Four shape specs (Y-up, meter-ish units)

One server-authoritative dynamic rigid body with a **single active collider** and an animated visual mesh; do not simulate four separate overlapping bodies. Maintain position/velocity/orientation where reasonable. Align the bottom to current floor when swapping on a grounded surface; test requested collider occupancy against static world/players first. Remove/rebuild collider or set shape using supported Rapier API, preserving body identity if possible; update collider mass props/inertia. Keep a common approximate total mass initially and adjust drag/friction/torque damping by form.

- CUBE: ~2.0 × 2.0 × 2.0 rounded gold box. Stable, high friction, resists tipping, reliable pushing; cannot pass under low arches and too wide for narrow gaps. Gold/beveled details and seams; collider is simple box with visual bevel only.
- LONG: ~4.7 × 0.76 × 1.1 golden beam, lying horizontally. Spans gaps and passes low openings if aligned; turns slowly, awkward around corners, high leverage under wind. Box collider; no custom mesh-collider collision.
- TALL: ~1.1 × 4.4 × 1.1 vertical pillar. Touches high switches/overhangs but easy to tip, hard to drag across narrow routes. Box collider and weaker angular damping.
- ROUND: radius ~1.05 glossy-but-not-metallic golden sphere. Rolls rapidly downhill, passes rounded track, avoids some corners; hard to stop and maintain alignment. Ball collider, lower friction.

Important: do not rely on the 3D model morph animation for collision. Visualize transformation over ~250–450 ms with squash/scale, spinning lines, sparks and one pop sound; switch collider at one fixed point in animation on the authoritative simulation. Synchronize resulting shape ID, transforms, and event time to all clients.

## 4 — Tradeoff as actual game design

Every transformation must offer a concrete benefit **and** immediate disadvantage; no shape may be universally optimal. Mechanics, not a tradeoff meter, tell the story:
- CUBE keeps position in wind, but won't fit a low tunnel.
- LONG fits the tunnel and triggers a bridge socket, but wind torques it sideways and makes corners awkward.
- TALL can reach the high lever, but may topple and requires two players to steady it.
- ROUND races along the finishing slope faster than anything, but one wrong shove sends it toward an edge.

The clever part is *when* to shift, not memorizing one correct predetermined shape. Wherever feasible, allow multiple legitimate solutions: e.g. CUBE safe and slow down one path versus ROUND risky and fast on another. Include a simple finishing score based primarily on time and falls/resets; don't punish transformations themselves since choosing shapes is the point of the game. Make the main puzzle solutions reasonably obvious using environmental silhouettes and brief camera callouts, never essay-length text.

## 5 — Course design (one seamless world, four CHAPTERS, checkpoints)

**The Golden Road (single 3–5 minute hero course)** — a sequence of compact floating islands with an approachable 3/4-isometric perspective. Each chapter is a playable zone connected by visible bridges; scenic off-path islands are decorative only. Keep walkable widths forgiving (at least 3 units for paths except intentional obstacle pinch points) and ensure camera always sees player and main object.

1. **Royal Loading Dock / tutorial (~30–45 seconds)**: team spawns with artifact in CUBE form, big castle visible in background. Three contextual icons highlight E to grip, WASD to move, 1–4 shift. Players push cube onto a wide wooden pressure tile, opening a gate. The first low arch requires LONG; players can see the clearance difference. Checkpoint after arch.
2. **Windbridge Cliffs (~45–65 seconds)**: a wide safe walkable catwalk runs adjacent to a 3.3-unit cargo gap, so players never become stranded on opposite sides. LONG can slot into a clearly glowing horizontal receiver spanning the cargo gap; after holding it there for ~1 sec, a mechanical wooden carrier/bridge unfolds and supports the artifact crossing. Wind periodically pushes the artifact; CUBE is more stable but cannot span the socket; ROUND may roll unexpectedly. No fragile free-floating object-as-player-bridge scheme that strands the team. Checkpoint on opposite island.
3. **The Crooked Tower (~45–65 seconds)**: a high wall-mounted lever ~3.3 units above ground controls a lift. TALL can physically touch the lever while two players support it; tip hazards give meaning to co-op. Add one simple moving platform/elevator with big stable collision and a safe landing. CUBE and ROUND cannot reach lever, LONG cannot touch it at current placement. The lift transports both players and artifact to the next island. Checkpoint at top.
4. **Castle Dash (~45–70 seconds)**: a bright downhill course with banked edges, one large cartoon fan, generous recovery zones, and a clearly visible finish ring. ROUND is quick but dangerous; CUBE is slower but easier to steer. The three players and artifact must all be inside the final goal sensor for 1.5 seconds. Castle door opens and king uses object to prop open door. Victory fanfare, confetti, and team report.

Stretch-only extra courses, NOT before core polished and fully tested: Narrow Caves (precise LONG steering), Moving Platforms (CUBE stability vs ROUND rolling). If these fit, expose as replayable level choices. Never attempt four unfinished standalone maps before the single hero route works.

The four chapters above deliberately reuse islands, bridges, rocks, platforms, wind, switches, checkpoints, and flowers. A reusable obstacle module system is preferred over scattered hand-crafted JSX.

## 6 — Look and art direction

- Diorama / clean stylized low-poly to medium-poly toy-world look, not photorealism or pixel art.
- Sky #86D9F6; grass #84CFA0; artifact #FFD153; accent pink #F49BB5; accent lavender #9B8DE4; warm wood #A77957; character red #FF697F, blue #64B9F4, green #80D78E.
- Orthographic or gentle perspective 3/4 camera (initial pitch around 35–45°). Aim to fit local player, nearby friends, artifact, and next obstacle. Smooth follow of team centroid with bias toward artifact; adaptive distance/zoom for small separations; never so close that the player can't understand orientation.
- Layered irregular floating islands: flat playable top with grass/stone trim; tapered chunked stone bottom; carefully spaced bushes, simple trees, mushrooms, stepping stones, few houses. A clean gameplay runway must dominate.
- Lush depth: distant non-colliding scenery islands, small waterfall planes, soft volumetric-like fog achieved cheaply, sky gradient, warm directional sunlight, ambient fill, believable shadows, and small bloom limited to goal/shift particles.
- Don't use a cheap generic neon-gradient website landing page. Build the menu with an in-engine cinematic diorama preview, chunky friendly typography (Fredoka/Nunito licensed open fonts), a PLAY CTA, nickname, room-code optional field, and minimal controls.
- Imported kit models must be re-scaled, palette-matched, and grouped to avoid obvious mismatch. Use only a curated selection, not entire huge packs. Make all interactable machines a clearly shared golden/wood/teal mechanical language.
- Optimization: prefer instancing repeated decorations, frustum culling, compressed GLB, limited real-time shadows (1024–2048 maps as appropriate), capped device pixel ratio, and optional reduced effects. Target desktop Chrome/Edge 60fps on typical laptop GPU and <~35MB initial transferable assets if feasible.

## 7 — Asset download and creation plan (NO ACCOUNT to download)

Assets should be fetched from open, free, CC0 original sources where accessible. Validate each license on source and save URL/license in `ASSET_CREDITS.md`. NEVER scrape gated/paywalled Source-tier files or invent asset names. If an automatic download is blocked by source anti-bot or license gate, proceed with procedural geometry and record the blocker rather than wasting hours.

CORE:
1. Quaternius Stylized Nature MegaKit, free Standard version: https://quaternius.com/packs/stylizednaturemegakit.html — trees, plants, rocks, bushes, mushrooms; CC0, free selection only.
2. Kenney Fantasy Town Kit: https://kenney.nl/assets/fantasy-town-kit — castle approach and cottages, CC0.
3. Kenney Platformer Kit: https://kenney.nl/assets/platformer-kit — modular platform and obstacle pieces, CC0.
4. Kenney Castle Kit: https://kenney.nl/assets/castle-kit — towers, walls, end castle, CC0.
5. Kenney Mini Characters (backup ONLY): https://kenney.nl/assets/mini-characters — if chibi procedural characters are impossible in schedule; CC0.
6. Kenney UI Pack - Adventure: https://kenney.nl/assets/ui-pack-adventure — stylized buttons/panels, CC0; use sparingly.
7. Kenney Particle Pack: https://kenney.nl/assets/particle-pack — optional particle textures, CC0.

Make in code: 3 chibi player characters, four hero object forms, glowy goal arch, island rock silhouette, wood-beam bridge/catwalk, high switch/lever, simple lift, wind ribbons, waterfall meshes, checkpoint flags, ropes/grab visual, buttons, camera, title composition, UI layout.

AUDIO (pick final files after audition; no fake claims about quality):
- Main fantasy BGM: https://opengameart.org/content/once-upon-a-time-loop — CC0 MP3, 1.8 MB.
- Alternate upbeat BGM: https://opengameart.org/content/loop-town — CC0 OGG 2.4 MB.
- Kenney Music Jingles: https://kenney.nl/assets/music-jingles — victory/failure, CC0.
- Kenney Impact Sounds: https://kenney.nl/assets/impact-sounds — bumps, thumps, CC0.
- Kenney Interface Sounds: https://kenney.nl/assets/interface-sounds — shifts, pings, CC0.
- Kenney RPG Audio: https://kenney.nl/assets/rpg-audio — footsteps/wood/foley, CC0.
- Kenney UI Audio: https://kenney.nl/assets/ui-audio — clicks, CC0.

Pick discrete sounds for: idle UI, countdown tick, jump, land, grip, release, four shift variations (can reuse one with varied pitch), wood impact, heavier impact, wind, button lever, checkpoint, failure/fall, victory fanfare. At least 8 distinct audible events. Limit collision audio rate; use spatial attenuation sparingly, no ear-destroying stacking. Fade music on start/finish, duck during win/loss, sound ON after explicit user action. Web audio autoplay policies must be respected. Audio and music volume separate; remember settings via localStorage.

IMPORTANT: Mixkit *stock music* licensing excludes video games. Do NOT use it as background music. Only use assets with explicitly game-compatible terms.

Tools without asset-site registration: Three.js, React Three Fiber, @dimforge/rapier3d-compat or @react-three/rapier (depending on chosen shared-simulation architecture), Vite, Socket.IO, Node.js, FFmpeg, Blender if installed, @gltf-transform/cli for optimizing GLB, Kenney/Quaternius free asset download links, OpenGameArt CC0 track downloads. Use package manager downloads as needed. A hosting service may require the DEVELOPER to create an account; PLAYERS must never need accounts.

## 8 — Physics and multiplayer: choose consistency over fancy tricks

Suggested design: **single Node server serving frontend and controlling each 3-player room, with one authoritative Rapier physics world per room**. The render client uses React+Vite+R3F and receives 20Hz snapshots to interpolate all players and artifact, at 60fps visually. The server steps physics at a fixed rate (prefer 60Hz with accumulator/cap), owns player positions/input, object body and shape, checkpoints, win conditions and timer. Inputs from clients at 20–30Hz (movement vector, jump edge, grab flag, shape request). Never independently run three competing dynamic object physics simulations. Optional local prediction/reconciliation for owning avatar, but don't let prediction jeopardize consistency.

Use rapier3d-compat in Node if WASM deployment is straightforward; if environment/platform blocks native/WASM server physics, use ONE authoritative host client with relay snapshots as a documented fallback, and test host-disconnect behavior. Do not attempt both approaches simultaneously. Keep all world geometry, collision surfaces and spawn positions deterministic.

3-slot room architecture:
- On connect: assign a stable ephemeral session token in browser storage; no login.
- User clicks PLAY; server joins waiting auto-match queue; first three queue entrants create a room and fill red/blue/green slots. Later users form the next room. Support OPTIONAL room code for friends if needed.
- Third entry: 5-second countdown; start only when all 3 ready and connected.
- Broadcast `room:state` snapshots (positions, rotations, velocities as needed, object shape, checkpoint, timer, animations, game phase); reliably broadcast `shift`, `checkpoint`, `puzzle solved`, `finish`, `reset` events.
- Late fourth player never joins active 3-player room.
- On disconnect: pause active round for 30–45 seconds with reconnecting overlay, hold slot for matching session token; restart countdown on resume. If player never returns, offer return to lobby. Recreate/clean up abandoned rooms without stale stale timers.
- Server validates key event rates, shape proximity, collision checks, checkpoint progression, scoring, and win conditions. No sophisticated authentication/security needed for a friends-only jam.
- HTTP/WSS served same origin where possible. Socket.IO 4.x rooms are suited to this topology: https://socket.io/docs/v4/rooms/.

Physical grip model: server detects players near main artifact; E activates a fixed-length grab-tether with damped spring forces in the direction of player grab anchor. Use clamped forces so three players cannot launch it into orbit; set max grip distance. Give camera and animations enough feedback so grabbing is never ambiguous. Server uses simple avatar capsules/kinematic controller and collision-safe movement; no ragdoll characters or per-limb physics.

## 9 — UI / player journey

`Landing (cinematic diorama + PLAY)` -> `Optional nickname and room code` -> `Waiting for 1/3, 2/3, 3/3 with three cheerful portraits` -> `5 4 3 2 1 GO!` -> `Short control tutorial in first 15 sec` -> `One continuous adventure with checkpoint confetti` -> `King gag / result screen` -> `Play again, new round`.

HUD: timer at top, current shape small pictogram, one clear goal indication, three small player color tags/connection state; at most two brief instructional callouts on screen. No huge leaderboard panels while playing. Show progress through chapter names briefly, falling reset feedback clearly, and visible next objective. Use a clean, legible font and outline/shadow for text contrast.

End scoring suggestion: `score = max(0, 1200 - elapsedSeconds*2 - fallCount*35)`, or another simple stable formula with explanatory labels. Emphasize fastest time, falls, and an optional humorous 1–3 crown rating. All three must cross finish; no separate competing winners.

## 10 — Project structure and tech choices

- TypeScript throughout.
- Frontend: React, Vite, @react-three/fiber, @react-three/drei, Three.js, lightweight UI CSS; optional postprocessing if performant.
- Server: Node, Express (serves built Vite output), socket.io, Rapier physics per active room. One public port from `process.env.PORT || 3000`.
- Avoid external hosted textures/fonts at run-time when possible. Public assets should be bundled into `/public/assets/` and audited for their licensing.
- Suggested structure:
  - `src/app/` menus/lobby/HUD/results
  - `src/render/` camera, visual actors/artifact, scenery, audio/VFX
  - `src/shared/` constants, protocol, shapes, level data/types
  - `server/` app, matchmaking, rooms, simulation, physics, levels
  - `public/assets/models/`, `public/assets/audio/`, `public/assets/ui/`
  - `docs/` ASSET_CREDITS, README, controls, test checklist.
- Provide `npm install`, `npm run dev`, `npm run build`, `npm start` scripts. If separate client/server dev ports, proxy Socket.IO to backend in Vite. Do not leave hardcoded localhost WebSocket URLs in production.
- Limit dependencies and build/deploy complexity; ship ONE Node-hosted web app.

Testing and tooling: Playwright or browser UI screenshots (if available) and repeated smoke tests, not just TypeScript compiler success. Run production build and inspect at 1280×720 and a 16:10 viewport. No blocker should silently make the screen empty. Use console warnings to catch GLB loading errors and network failures. Keep a graceful fallback if a decorative asset fails.

## 11 — Publishing, free options

Primary demo for testing **without creating a hosting account**: install `cloudflared`, run `npm start` on local PC, then `cloudflared tunnel --url http://localhost:3000`, share resulting temporary HTTPS `trycloudflare.com` URL. It supports sharing a web server and requires no Cloudflare account; it is for testing only, link changes on restart, and the host machine/server must stay online. Source: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

For a more persistent deployment, Render Free Web Service supports Node servers + WebSockets, but the developer must register a hosting account and there is an idle spin-down/cold-start limitation. Source: https://render.com/docs/free. Deploy early so browser-game visitors don't hit cold-start surprises.

Regardless of approach: websocket URL from current origin, reconnect UX, 3-person real-network test using exact public URL. Inform me explicitly about any hosting credential requirements; never fake deployment.

## 12 — 24-hour priority plan and kill-switches

0–2h: functioning project, camera, island blockout, player/controller, CUBE push, single tab.
2–5h: four forms, safe collider changes, one meaningful puzzle, reset/checkpoint.
5–9h: genuine three-player matchmaking + synchronized physics, 3-tab and external network testing; NO adding new art until three players can move the same object.
9–14h: curate imported assets and procedural beautification; camera, color, lighting, character animation.
14–18h: finish all four chapters in one hero course, tutorial, checkpoint, goal, scoring and ending.
18–21h: background music, SFX, shape animations, VFX and visual/UI polish.
21–24h: production build, browser tests, server stability, fps, public URL, demo rehearsals, bug fixes only.

Kill switch: if multiplayer not truly working by hour 9, stop feature development and fix networking. If hero course not complete by hour 18, cut extra puzzles and finish one fully playable route. If frame rate drops, remove bloom and expensive shadows, NOT gameplay. If asset download fails, use procedural substitutes and continue. If a level traps players, widen spaces and add a clear reset instead of complex solver engineering.

## 13 — Acceptance / proof required before saying DONE

- [ ] Actual public/working browser landing page with local PLAY.
- [ ] 3 tabs / 3 devices enter and share one room and physics state; fourth does not invade.
- [ ] All three avatars are independently controllable and visually differentiated.
- [ ] Object reacts to pushing and E grip; all four forms work and collide with world appropriately.
- [ ] Shape changes are visible simultaneously for everyone, not locally divergent.
- [ ] At least three puzzles with actual tradeoffs and a visible finish/end gag.
- [ ] Recoverable resets/checkpoints, no permanent softlocks.
- [ ] Imported/procedural art makes an attractive warm fantasy world, clear camera and playfield.
- [ ] Background music audibly loops and at least eight different SFX events trigger; mute works.
- [ ] Intro/lobby/tutorial/results/replay present, no login for players.
- [ ] `npm run build` passes; client console/server show no blocking errors.
- [ ] Real screenshots or video showing gameplay; public URL if deployed; precise run commands.

## 14 — Start now (instruction to Opus)

FIRST: inspect working directory, installed tools, network/asset access, and system constraints. Write a very brief execution plan and create the repo. Then begin implementing. Do not ask me to choose among dozens of frameworks or repeat requirements. Make technical decisions aligned with these constraints, continuously run code/test, and give me concise milestone reports with actual functioning evidence. Build a solid playable vertical slice and prove THREE-person multiplayer before spending time on castle decorations. Use the available agents in parallel only when file ownership and integration boundaries are clear. Before you report completion, perform the checklist above and truthfully state any remaining limitations.
