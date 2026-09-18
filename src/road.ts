/** A country-road loop around the fields, with one route through the middle. */
export const ROAD_HALF_WIDTH = 8;

export function roadCentre(x: number, width: number, height: number): number {
  const t = x / width * Math.PI * 2;
  return height * (0.5 + 0.04 * Math.sin(t + 0.3));
}

/** Distance to the nearest road centre, including the two rounded junctions. */
export function roadDistance(x: number, y: number, width: number, height: number): number {
  const t = x / width * Math.PI * 2;
  const slope = height / width * Math.PI * 2 * 0.04 * Math.cos(t + 0.3);
  const across = (y - roadCentre(x, width, height)) / Math.sqrt(1 + slope * slope);
  const end = Math.max(0, Math.abs(x - width / 2) - width * 0.43);
  const middle = Math.hypot(across, end);
  const radius = height * 0.19;
  const qx = Math.abs(x - width / 2 + 2.5 * Math.sin(y / height * Math.PI * 2 + 0.4)) - (width * 0.43 - radius);
  const qy = Math.abs(y - height / 2 + 3 * Math.sin(t - 0.7)) - (height * 0.39 - radius);
  const ring = Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius);
  const join = Math.max(0, 1 - Math.abs(ring - middle) / 4);
  return Math.max(0, Math.min(ring, middle) - join * join);
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
  let t = p.x / C.misc2.x * 6.28318530718;
  let centre = C.misc2.y * (0.5 + 0.04 * sin(t + 0.3));
  let slope = C.misc2.y / C.misc2.x * 6.28318530718 * 0.04 * cos(t + 0.3);
  let across = (p.y - centre) / sqrt(1.0 + slope * slope);
  let end = max(0.0, abs(p.x - C.misc2.x / 2.0) - C.misc2.x * 0.43);
  let middle = length(vec2f(across, end));
  let radius = C.misc2.y * 0.19;
  let bend = vec2f(2.5 * sin(p.y / C.misc2.y * 6.28318530718 + 0.4), 3.0 * sin(t - 0.7));
  let q = abs(p - C.misc2.xy / 2.0 + bend) - (C.misc2.xy * vec2f(0.43, 0.39) - vec2f(radius));
  let ring = abs(length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius);
  let join = max(0.0, 1.0 - abs(ring - middle) / 4.0);
  return max(0.0, min(ring, middle) - join * join);
}
`;
