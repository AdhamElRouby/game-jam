# Performance and movement verification — 21 October 2026

Production Vite/esbuild bundle, installed Google Chrome via Playwright and Chrome DevTools Protocol CPU sampling, high quality unchanged, 1280×720, six-second samples after warmup. One and three independent browser contexts on the same laptop; the three-client tests share the host CPU/GPU and are not a substitute for three physical computers. Test placement uses the existing `SH_DEV=1` hooks. Raw JSON, CPU profiles and screenshots are in `tests/out/performance/`.

## One local browser

FPS is the median across clients; frame time is the worst client p95.

| World | FPS before → after | p95 frame ms before → after | RTT median ms before → after |
|---|---:|---:|---:|
| Loading Dock | 34.0 → 34.0 | 33.5 → 33.5 | 1.5 → 1.8 |
| Windbridge | 36.7 → 34.2 | 33.4 → 33.5 | 1.4 → 1.6 |
| Clockwork | 37.4 → 38.2 | 33.4 → 33.4 | 1.9 → 1.8 |
| Mushroom | 27.7 → 41.4 | 50.0 → 33.3 | 4.3 → 1.7 |
| Railway | 34.9 → 46.2 | 41.6 → 25.1 | 1.9 → 1.7 |
| Castle | 33.1 → 41.9 | 41.6 → 33.2 | 35.9 → 1.6 |

## Three local browsers

FPS is the median across clients; frame time is the worst client p95.

| World | FPS before → after | p95 frame ms before → after | RTT median ms before → after |
|---|---:|---:|---:|
| Loading Dock | 11.1 → 11.6 | 108.5 → 100.1 | 1.7 → 1.5 |
| Windbridge | 10.3 → 12.4 | 133.0 → 91.6 | 1.6 → 1.3 |
| Clockwork | 11.8 → 13.1 | 116.6 → 91.8 | 1.6 → 1.2 |
| Mushroom | 12.4 → 14.5 | 108.3 → 83.4 | 1.5 → 1.3 |
| Railway | 13.6 → 15.1 | 91.7 → 75.1 | 1.5 → 1.4 |
| Castle | 12.5 → 13.4 | 100.0 → 83.5 | 1.7 → 1.4 |

## Three browsers through Cloudflare

FPS is the median across clients; frame time is the worst client p95.

| World | FPS before → after | p95 frame ms before → after | RTT median ms before → after |
|---|---:|---:|---:|
| Loading Dock | 8.3 → 11.3 | 158.4 → 100.0 | 101.9 → 89.9 |
| Windbridge | 9.8 → 11.8 | 125.2 → 99.8 | 95.5 → 90.7 |
| Clockwork | 11.2 → 12.1 | 116.2 → 116.6 | 94.9 → 90.4 |
| Mushroom | 12.6 → 14.0 | 100.2 → 83.4 | 94.5 → 90.8 |
| Railway | 12.8 → 14.9 | 91.8 → 75.0 | 96.6 → 89.9 |
| Castle | 11.0 → 13.0 | 116.5 → 83.5 | 99.2 → 90.8 |

## Input response

Eight real keyboard press/release trials on open ground in World 1. Visible onset uses 0.015 m displacement; stopping uses horizontal velocity below 0.1 m/s. Server response is measured when the authoritative response arrives at the client. These timings include scheduling and display sampling.

| Path | Visible onset median ms before → after | Visible stop median ms before → after | Post-release travel median m before → after |
|---|---:|---:|---:|
| local | 113.8 → 49.0 | 209.4 → 145.1 | 0.69 → 0.35 |
| cloudflare | 199.2 → 23.3 | 306.5 → 185.9 | 1.22 → 0.63 |

## Physics and tick timing

Isolated three-courier physics benchmark: 300 warmup ticks, 2,100 measured ticks/world, varied directions and grips.

| World | Rapier p95 ms before → after | Whole simulation p95 ms before → after | Colliders |
|---|---:|---:|---:|
| Loading Dock | 0.478 → 0.217 | 1.117 → 0.490 | 110 |
| Windbridge | 0.344 → 0.219 | 0.718 → 0.416 | 110 |
| Clockwork | 0.347 → 0.207 | 0.635 → 0.377 | 110 |
| Mushroom | 0.283 → 0.162 | 0.581 → 0.327 | 50 |
| Railway | 0.217 → 0.165 | 0.429 → 0.304 | 36 |
| Castle | 0.227 → 0.174 | 0.433 → 0.328 | 110 |

The integration step remains 1/60 s. `/healthz` now reports bounded rolling measurements of actual server tick intervals, whole-tick work, Rapier work, and dropped catch-up steps. Live server timings, including transition/startup stalls, are recorded per world in the after JSON files. No pre-change live tick-work instrumentation existed; the before isolated physics benchmark and snapshot cadence are available, but a live before/after server-work speedup is not claimed.

## Root causes and changes

- Keyboard edges previously waited up to 33 ms for upload. Input changes now upload immediately; periodic packets remain as a heartbeat. Focus loss and menus send neutral input. Stalled connected clients release movement, grip and use after 500 ms. Key repeat no longer repeatedly toggles menus/actions.
- The local player previously used 50 ms of snapshot interpolation with no prediction. Open-ground local presentation now uses a bounded 150 ms horizon and the shared acceleration controller in fixed substeps, conservative wall sweeps and short reconciliation. Contacts, artifact forces and ropes remain authoritative on the server. Prediction is disabled near the artifact, on moving supports, in wind/slippery ground, while gripping, tumbling or respawning. Moving supports and their riders use the same interpolated timeline. Artifact piloting uses a shorter interpolated timeline, without running competing artifact physics.
- N8AO re-renders transparency layers twice. Those passes were repeatedly updating the whole scene graph and could overwrite opaque shadow maps. Matrices now update once after animations; only the main scene pass updates shadows. Static kit/model local transforms are cached. The Canvas scene is memoized against DOM lobby updates. CPU sampling of World 1 shows `updateMatrixWorld` self time falling from about 732 to 269 ms over the six-second sample.
- Transient input and snapshot packets use volatile delivery to avoid application backlogs; cumulative button counters preserve missed edges. Snapshot buffering adapts to jitter, clears on map changes, rejects reordered timestamps, and interpolates wrapped rotor angles along the shortest path.
- The server keeps fixed physics steps and now preserves accumulator fractions when dropping overdue work; diagnostics expose overload instead of hiding it. Existing collider counts were already small and Rapier was below budget, so no gameplay colliders or visual effects were removed.

## Scope and remaining issues

- High-quality AO, bloom, shadow resolution, textures, particles and Astra’s scene composition remain enabled. The report does not claim universal FPS improvement: the loading dock barely improved, and Windbridge solo FPS regressed slightly in these short runs.
- Three full-quality browsers sharing this laptop still miss smooth frame pacing. Further draw-submission/GPU profiling and testing on three separate machines remain necessary. Cloudflare still adds real transport latency; artifact contacts and piloting deliberately wait for the authoritative server.
- Warm samples do not prove cold shader compilation or every live mechanism/camera interaction is stutter-free. Level-start performance is separated from steady-state samples.
- Full CPU profiles can be opened in Chrome DevTools Performance; scripts reproduce the production measurements. No quality preset changes were used as the performance fix.

## Handoff and validation

Build, TypeScript and whitespace checks passed. Physics, all four piloting shapes, mushroom mechanisms, stress tests (moving clock hand, wobble bridge, crane with a pilot, repeated recalls), and the full six-world Room bot adventure passed. Socket.IO tests passed pilot sync, stale/malformed inputs, identical mechanism state, results voting, reconnect and subsequent world change. Three real browser contexts through Cloudflare compared 178 shared snapshots across all six worlds: all identical.

The first camera browser run passed camera-relative WASD, wall sweeps, first-person views in every shape, LONG steering, ROUND view stability, exit and respawn checks. Its camera velocity-jitter check narrowly failed (3.03 m/s change versus a 3 m/s limit). An experimental camera spring performed worse (3.77 m/s) and was reverted. Camera jitter remains unresolved; do not claim the complete camera suite passed. The rerun was stopped for the requested expedited handoff. The test's transition wait was also fixed to tolerate a temporarily empty snapshot buffer.

Physics benchmark figures describe two runs under different host load; no physics algorithm speedup is inferred. Rapier and collider counts were not the root rendering bottleneck. Open-ground correction diagnostics are available in after-corrections-cloudflare.json; its aggregate includes intentional placement teleports and must not be treated as an ordinary-movement maximum.

A subsequent two-trial tunnel probe resets diagnostics after placement: 39 measured reconciliations, median 0.036 m, p95 0.279 m, maximum 0.656 m (`after-corrections-final.json`). This ran alongside browser validation and is a limited open-ground sample, not proof of correction-free play.

Profiling servers and the temporary Cloudflare tunnel were stopped for handoff. The production server still defaults to loopback; the next agent can configure HOST/PORT for the local network. Existing package.json/package-lock.json edits were preserved.
