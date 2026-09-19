/**
 * The ring Street, at the kerb of the Lawn.
 *
 * It runs in the margin outside every Field, because a Street is a boundary
 * and never a cut: ground a Street would take out of the middle of a parcel
 * is verge, and not Field at all. Everything here is a fraction of the Lawn,
 * so the ring grows with it.
 */
export const STREET_HALF_WIDTH = 7;
/** How far the ring's centreline sits from the edge of the Lawn. */
const RING_INSET = 0.033;
/** How round its corners are. */
const RING_CORNER = 0.11;

/**
 * Distance to the ring's centreline: negative inside the ring, positive
 * outside it. The sign is what says which side of the kerb a point is on, so
 * `-ringDistance` is the room a Field has left before the ring would cut it.
 */
export function ringDistance(x: number, y: number, width: number, height: number): number {
  const corner = height * RING_CORNER;
  const inset = height * RING_INSET + corner;
  const qx = Math.abs(x - width / 2 + 2.5 * Math.sin(y / height * Math.PI * 2 + 0.4)) - (width / 2 - inset);
  const qy = Math.abs(y - height / 2 + 3 * Math.sin(x / width * Math.PI * 2 - 0.7)) - (height / 2 - inset);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
}

export const RING_WGSL = `
const STREET_HALF_WIDTH = ${STREET_HALF_WIDTH.toFixed(1)};
fn ringDistance(p : vec2f) -> f32 {
  let corner = C.misc2.y * ${RING_CORNER};
  let inset = C.misc2.y * ${RING_INSET} + corner;
  let bend = vec2f(2.5 * sin(p.y / C.misc2.y * 6.28318530718 + 0.4), 3.0 * sin(p.x / C.misc2.x * 6.28318530718 - 0.7));
  let q = abs(p - C.misc2.xy / 2.0 + bend) - (C.misc2.xy / 2.0 - vec2f(inset));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - corner;
}
`;
