/** Model dimensions are shared with the cut so resizing the deck cannot widen its reach. */
export const MOWER_SCALE = 2.6;
export const DECK_SIZE = 1.7;
export const DECK_OFFSET = 0.05;
// Leave room inside the faceted housing, including its shorter rear edge.
export const MOW_RADIUS = MOWER_SCALE * (DECK_SIZE / 2 - Math.abs(DECK_OFFSET) - 0.02);
export const COLLISION_RADIUS = MOWER_SCALE * 0.85;

/** Visit tile centres swept by the blade, identically on the client and server. */
export function forEachMownTile(x0: number, y0: number, x1: number, y1: number,
  width: number, height: number, radius: number, visit: (i: number, x: number, y: number) => void): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + radius));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + radius));
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / len2));
      const ox = px - t * dx, oy = py - t * dy;
      if (ox * ox + oy * oy <= radius * radius) visit(y * width + x, x, y);
    }
  }
}
