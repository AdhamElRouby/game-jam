# Gameplay expansion — plan and shared interfaces

Branch `gameplay-expansion` (worktree `../game-jam-gameplay`). Gameplay, physics, multiplayer, level logic and scoring
live here; Astra owns art, lighting, VFX look and camera presentation. This file is the contract between the two.

## Baseline (before any change)

`npm run typecheck` clean · `sim-test.ts` all pass · `bot-run.ts safe` finishes the old 4-chapter course in 146.6 s, 0 drops.

## Architecture decisions

1. **Six maps, one Sim per map.** `src/shared/maps/` holds declarative `MapDef`s (spawns, checkpoints, anchors, goal,
   mechanisms, objectives, par time, music, briefing). The room builds a fresh `Sim` per map and disposes the old one.
2. **Original course = Worlds 1, 2, 3, 6.** Those maps keep using `LEVEL` geometry (so Astra's islands, bridges, castle,
   scenery and props stay exactly where they are). Every original-course Sim builds *all* `LEVEL` static colliders, so
   nothing visible is ever non-solid; per-map *blockers* close the exits. Legacy machines (plate, gate, receiver,
   drawbridge, lever, lift) are live only in their own map and frozen solved/unsolved elsewhere.
3. **Worlds 4 and 5 are standalone maps** with their own islands and visuals; the original course is hidden while they
   are active.
4. **Generic mechanisms, wired by signals.** Each mechanism may emit a boolean signal (`id`) and react to one (`when`).
   Kinds: plate, gate, dock (receiver), drawbridge, pushLever, lift, wind, switch (Q), spring, mover, rotor, wobble
   bridge, slip zone, puffer, collectible, cart, crane, blocker, logic (and/or).
5. **Piloting** is an authoritative occupancy state on the Sim: one pilot max, the pilot's courier body is disabled while
   inside, exits are validated (ground below, clear capsule, line of sight, not moving fast) and delayed when unsafe.

## Shared interfaces (Astra: read these, don't rename them)

- `frame.current.w` keeps every legacy field (`plate, gate, recv, bridge, lever, liftY, liftGate, lift, aboard, wind,
  fan, goal, steady, resetVotes`). For maps that don't own a legacy machine the server sends its solved or initial
  value, so the existing World/Ch2/Ch3 components keep working unchanged.
- `snapshot.mp` active map index · `snapshot.pi` pilot slot (-1 none) · `snapshot.m[i]` state numbers of mechanism `i`
  of the active map · `snapshot.ob` current objective index.
- Player flags: `PF_PILOT` (inside the artifact), `PF_TUMBLE` (knocked over), `PF_SPRINT`, `PF_USE` (holding Q),
  `PF_ONMOVER` (standing on a moving platform).
- Boxes with `mat: 'invisible'` + `vis: '<kind>'` are gameplay-owned visuals (rendered by `render/Mechanisms.tsx`).
- Decoration keep-out rectangles for new gameplay areas come from `LEVEL.decorKeepOut`.
- `render/mapState.ts`: `useActiveMap()` (React, from the lobby) and `activeMap()` / `mechState(i)` (per frame, from the
  snapshot). `MapDef.intro` (goal + shape tradeoff) is the world briefing; objectives carry plain-English `text` / `tip`
  (`[Q]` draws a key cap) and a `hint` with optional `marks`. The old `MapDef.camera` table is gone: every player now
  has a free camera (below).
- Camera (`render/CameraRig.tsx`): `camView` tells visuals what the local camera is doing (`fpv` while it sits inside
  the artifact: the shell, the pilot dome and your tag hide, `render/Cockpit.tsx` shows; `hideMe` when it's pressed
  against your courier; `dist` / `fx` / `fz` for the shadow frustum). Decor materials from `Models.tsx` get the
  see-through cut (`render/seeThrough.ts`); `render/DetailCull.tsx` skips tiny far decor, and anything that must stay
  visible at a distance goes under a group with `userData.noCull` (the mechanisms do).
- `render/MapWorld.tsx` mounts the course once (a memoized element: it must not re-render on world switches) and puts
  everything per-map under `<Disposer>` (`render/Disposer.tsx`), which frees GPU resources on unmount.
- `useGame().cutscene` hides the World 6 portcullis (its lintel sits between the ending camera and the King).
- The lobby has a world picker (`app/WorldPicker.tsx`): `lobby.votes` holds each slot's pick in the lobby as well as on
  the results screen, and `lobby.tieMs` counts down a split-vote draw. World pictures are
  `public/assets/worlds/<map id>.jpg`, made by `tests/thumbs.ts` (re-run it after visual changes).
- Visual work that would help (not done here, Astra's files): `KitMeshes` doesn't dispose the previous build when
  `make` changes, and `Lever` in `Ch3.tsx` passes a fresh `pivot` array into its memo deps, so it rebuilds on every
  render. Harmless now that the course never re-renders, but a trap for future parents.

## Controls

Mouse / touchpad look (click to capture, Esc frees) · scroll / pinch zoom · WASD move (relative to the camera) ·
Space jump · Shift sprint · E grip (hold) · F enter/exit artifact (first person) · V first person / outside view ·
Q use mechanism · 1–4 shift · R hop back · T recall vote · H controls · Esc menu · M mute. Piloting reuses WASD,
Space (shape ability; LONG: A / D pick the turn), 1–4, F.

## Milestones

1. Stabilize: branch, baseline tests. **Done.**
2. Piloting: occupancy, entry/exit validation, per-shape controls, sync, disconnect/reset handling, tests. **Done**
   (`pilot-test.ts`, `pilot-browser.ts`, `net-test2.ts`).
3. Map refactor + reusable mechanisms (data-driven), legacy behaviour preserved. **Done** (`sim-test.ts` on the map
   API, `bot-run.ts` per world).
4. Cooperation: Q interactions, two-player holds, prompts, bumps/tumbles/knockback. **Done.**
5. Levels: Worlds 1–3 and 6 extended with new encounters; Worlds 4 (Mushroom Mayhem) and 5 (Sky Railway) built.
   **Done** (bots finish all six with 0 drops).
6. Polish: per-map crowns + achievements, records, level select/replay votes, synthesized SFX, music per map.
   **Done**, except that the music is still the two CC0 loops played at a different rate per world.
7. Regression: per-map bot runs, stress tests, 3-browser flow, reconnection, perf. **Done**: see
   `docs/TEST_CHECKLIST.md`.

## Decisions made during regression

- Time-driven machinery (rotors, movers, gust and puffball cycles) only runs while playing (`sim.runTime`). The room
  steps the sim through countdowns, so the world at GO used to depend on the countdown length; now every run starts
  from the same state (fair records), and the world holds still through the resume countdown after a pause.
- `bot-run.ts --room` plays the whole adventure through the server `Room` (real input packets, room phases, votes) as
  the three-player complete-run test.
