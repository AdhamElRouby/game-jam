# SHIFT HAPPENS — ASSET & LEVEL BLUEPRINT

**Game:** 3-player browser co-op, shared physics puzzle, magical golden artifact. 3–5 minute connected run. No registration for players or for the listed original asset download pages.

## Curated asset manifest

| Category | Minimum asset inventory (not necessarily unique mesh files) | Source | License |
|---|---|---|---|
| World foliage | 3–5 trees, 3 bushes, 2 flowering plants, 3–5 rocks, 1 mushroom, grass tufts | https://quaternius.com/packs/stylizednaturemegakit.html (free standard selection) | CC0 |
| Fantasy village | 2 small houses, roof variations, windows, chimneys, village signs | https://kenney.nl/assets/fantasy-town-kit | CC0 |
| Castle | 2–3 turret types, main gate/arch, wall segments, castle roof | https://kenney.nl/assets/castle-kit | CC0 |
| Platforming | stone edge pieces, floor segments, ledges, rails, hurdles | https://kenney.nl/assets/platformer-kit | CC0 |
| Character backup | three suitable 3D mini character models/animations | https://kenney.nl/assets/mini-characters | CC0 |
| UI | button, panel, slider, badge; use sparingly | https://kenney.nl/assets/ui-pack-adventure | CC0 |
| VFX | optional spritesheets for sparkles/puffs | https://kenney.nl/assets/particle-pack | CC0 |
| Music A | orchestral/fantasy loop MP3 | https://opengameart.org/content/once-upon-a-time-loop | CC0 |
| Music B | upbeat music OGG | https://opengameart.org/content/loop-town | CC0 |
| Music jingles | victory, failed attempt, new chapter | https://kenney.nl/assets/music-jingles | CC0 |
| Impact SFX | wood thunk, metallic bump, heavy hit | https://kenney.nl/assets/impact-sounds | CC0 |
| UI SFX | hover, select, countdown, confirm | https://kenney.nl/assets/ui-audio and https://kenney.nl/assets/interface-sounds | CC0 |
| Foley | movement/impact/scrape candidates | https://kenney.nl/assets/rpg-audio | CC0 |
| Code-generated | 3 tiny couriers, 4 rounded artifact forms, floating island rock bases, bridge/fan/lift, clouds, waterfall, wind, banners, particles, goal ring | Three.js primitives, shape geometries, shader/simple VFX | Original |

**Creative selection notes:** Use a SMALL curated subset from each download; never ship giant raw kit ZIPs in web public folder. Recolor/palette-match unrelated kits. Audit original files' license notices. Prefer `.glb` and `.gltf`; when only `.fbx` available, convert with Blender if installed. Preserve source URL/license in `ASSET_CREDITS.md`.

## Shared dimensional conventions

- Y is up; player ~1.2m high; artifact cube ~2m; path width >=3m, except purposeful wide-clearance puzzles with alternative avatar paths.
- Dynamic physics bodies: avatar capsule and ONE artifact rigid body with one matching collider. Static collision proxy surfaces under floors, walls, bridge, receiver, lift. Visual cliffs, houses, forests mostly no collision except explicitly reachable obstacles.
- The server advances one room physics world at fixed rate; transforms replicated to clients. Model art never defines physics implicitly.
- Maintain grounding when switching shape; don't let collider overlap floor or wall. Use transparent ghost preview optionally for shift clearance.
- Low poly / rounded / matte / cartoon; sunlight warm; shadows soft; faint fog.

## Four-chapter single level

**1. Loading Dock (~35 sec)**
- Props: island, wooden dock, 1 cottage, 2 banners, crate clutter, broad pressure plate, low arch, checkpoint flag.
- Teach movement, grip, push, and transform; press big broad plate as CUBE then use LONG to pass low opening.
- Highlight downside: round rolls away too easily near edge; cube too tall at arch.

**2. Windbridge Cliffs (~60 sec)**
- Props: windy floating islands, fans/windmill, cargo gap, adjacent safe avatar path, long-beam receiver, wooden mechanical bridging platform, waterfall.
- Place LONG into receiver (fits >=4.3m), hold stable 1sec, bridge unfolds to let cargo pass. Wind makes long form torque and spin. CUBE more stable but can't activate receiver.
- Checkpoint on next island. Keep hazard wind visually readable with ribbon streamers.

**3. Crooked Tower (~60 sec)**
- Props: wooden tower, high lever, stable 6x6 lift, padded railings, checkpoint.
- TALL touches lever at 3.3m while two players steady it; hazards: leverage and tip. Lift raises object and players together after lever activation; no requiring climb of an uncrossable pillar.
- Camera tracks upward gently, no occlusion of avatar/object.

**4. Castle Dash (~60 sec)**
- Props: descending safe curved track, banked edges, one large fan, collectable confetti visual, castle gate, finish circle, noninteractive king.
- ROUND rolls quickly but threatens to overshoot; CUBE slower and safer. ALL three players + artifact must reach goal.
- King takes artifact, uses it to prop open the castle door. Show team-time and falls.

## 24-hour review gates

- Hour 2: an ugly but playable cube and character.
- Hour 5: physics and shapes transform without clipping.
- Hour 9: THREE browsers share authoritative world and solve basic tutorial.
- Hour 14: screenshot shows colorful, cohesive fantasy world with actual 3D models.
- Hour 18: whole course has beginning and ending.
- Hour 21: can hear a pleasant looping music track, collisions and shifts make sounds.
- Hour 24: deployed or reachable demo URL, real synchronized tests, no blocking regressions.

## Publishing choices

- Easiest short-lived account-free sharing for development: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ — run `cloudflared tunnel --url http://localhost:3000`; the server computer must remain online; temporary URL and no production SLA.
- Persistent hosting: https://render.com/docs/free — free tier Node app with Socket.IO WebSocket support, but developer has to create an account, services can sleep after inactivity. Keep active before demo.

## Common failure modes to test

1. Three browsers each see a different artifact shape or position (wrong authority).
2. Artifact gets stuck inside cave when its collider expands (unsafe morph).
3. One player misses the moving lift and course softlocks (insufficient safe zones).
4. Three simultaneous players push artifact too fast into orbit (uncapped grip forces).
5. Camera loses track of all players and artifact at different screen sizes.
6. Free stock music is accidentally used in a videogame under incompatible license.
7. Audio silent because playback wasn't unlocked by the PLAY click.
8. Browser shows gorgeous scene but no actual synchronized gameplay.

The #1 rule: **a real, coherent, replayable 4-minute experience wins over an ornate but broken prototype.**
