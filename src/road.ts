/** A country-road loop around the fields. */
export const ROAD_HALF_WIDTH = 8;

export function roadCentre(x: number, width: number, height: number): number {
  const t = x / width * Math.PI * 2;
  return height * (0.5 + 0.04 * Math.sin(t + 0.3));
}

/** Distance to the outer loop. */
export function roadDistance(x: number, y: number, width: number, height: number): number {
  const radius = height * 0.19;
  const qx = Math.abs(x - width / 2 + 2.5 * Math.sin(y / height * Math.PI * 2 + 0.4)) - (width * 0.43 - radius);
  const qy = Math.abs(y - height / 2 + 3 * Math.sin(x / width * Math.PI * 2 - 0.7)) - (height * 0.39 - radius);
  return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius);
}

export function roadAt(x: number, y: number, width: number, height: number): number {
  return Math.max(0, Math.min(1, (ROAD_HALF_WIDTH - roadDistance(x, y, width, height)) / 1.5));
}

export const ROAD_WGSL = `
const ROAD_HALF_WIDTH = ${ROAD_HALF_WIDTH.toFixed(1)};
fn roadCentre(x : f32) -> f32 {
  return C.misc2.y * (0.5 + 0.04 * sin(x / C.misc2.x * 6.28318530718 + 0.3));
}
fn roadDistance(p : vec2f) -> f32 {
  let radius = C.misc2.y * 0.19;
  let bend = vec2f(2.5 * sin(p.y / C.misc2.y * 6.28318530718 + 0.4), 3.0 * sin(p.x / C.misc2.x * 6.28318530718 - 0.7));
  let q = abs(p - C.misc2.xy / 2.0 + bend) - (C.misc2.xy * vec2f(0.43, 0.39) - vec2f(radius));
  return abs(length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius);
}
`;
