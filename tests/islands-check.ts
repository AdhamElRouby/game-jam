// verify island boxes exactly cover the polygon: sample points
import { LEVEL, islandBoxes } from '../src/shared/level';
function inPoly(x: number, z: number, pts: [number, number][]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function inBoxes(x: number, z: number, bs: ReturnType<typeof islandBoxes>) {
  return bs.some((b) => {
    const dx = x - b.p[0], dz = z - b.p[2];
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    // inverse rotate (yaw about Y): local x = c*dx - s*dz ; local z = s*dx + c*dz
    const lx = c * dx - s * dz, lz = s * dx + c * dz;
    return Math.abs(lx) <= b.s[0] / 2 + 1e-3 && Math.abs(lz) <= b.s[2] / 2 + 1e-3;
  });
}
let bad = 0;
for (const isl of LEVEL.islands) {
  const bs = islandBoxes(isl);
  let miss = 0, extra = 0;
  const { cx, cz, hx, hz } = isl.rect;
  for (let i = 0; i < 4000; i++) {
    const x = cx + (Math.random() * 2 - 1) * (hx + 0.5), z = cz + (Math.random() * 2 - 1) * (hz + 0.5);
    const a = inPoly(x, z, isl.pts), b = inBoxes(x, z, bs);
    // ignore points within 2cm of an edge
    if (a && !b) miss++;
    if (!a && b) extra++;
  }
  console.log(isl.id, 'boxes', bs.length, 'miss', miss, 'extra', extra);
  if (miss > 3 || extra > 3) bad++;
}
console.log(bad ? 'BAD' : 'OK');
