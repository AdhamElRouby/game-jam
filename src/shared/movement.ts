/** Acceleration-limited horizontal control, evaluated in seconds on both server and local presentation. */
export function approachVelocity(vx: number, vz: number, tx: number, tz: number, acceleration: number, dt: number) {
  let dx = tx - vx, dz = tz - vz;
  const length = Math.hypot(dx, dz), limit = acceleration * dt;
  if (length > limit) { dx *= limit / length; dz *= limit / length; }
  return { x: vx + dx, z: vz + dz };
}
