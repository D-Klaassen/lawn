/** Fixed landmarks shared by the client and the Lawn. */
export const TREES = [
  [0.19, 0.23, 1], [0.45, 0.18, 0.85], [0.81, 0.25, 1.15],
  [0.17, 0.55, 1.1], [0.48, 0.49, 1], [0.76, 0.55, 0.9],
  [0.23, 0.82, 0.95], [0.55, 0.78, 1.15], [0.83, 0.81, 1],
] as const;
export const TRUNK_RADIUS = 1.25;
export const EARTH_RADIUS = 2.3;

export function treeEarthAt(x: number, y: number, width: number, height: number): boolean {
  return TREES.some(([tx, ty, scale]) => {
    const dx = x - tx * width, dy = y - ty * height;
    const angle = Math.atan2(dy, dx), seed = tx * 37 + ty * 19;
    const edge = EARTH_RADIUS + 0.30 * Math.sin(angle * 3 + seed)
      + 0.18 * Math.sin(angle * 5 - seed * 2) + 0.09 * Math.sin(angle * 9 + seed);
    return Math.hypot(dx, dy) < edge * scale;
  });
}

export function treeAt(x: number, y: number, width: number, height: number, clearance = 0): boolean {
  return TREES.some(([tx, ty, scale]) =>
    Math.hypot(x - tx * width, y - ty * height) < TRUNK_RADIUS * scale + clearance);
}

/** Flat faces keep the crowns soft in silhouette and crisp in sunlight. */
export function treeMesh(): Float32Array {
  const vertices: number[] = [];
  function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, material: number) {
    const point = (row: number, col: number) => {
      const latitude = row / 6 * Math.PI, angle = col / 10 * Math.PI * 2;
      return [cx + Math.sin(latitude) * Math.cos(angle) * rx,
        cy + Math.cos(latitude) * ry, cz + Math.sin(latitude) * Math.sin(angle) * rz];
    };
    function triangle(a: number[], b: number[], c: number[]) {
      const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
      const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const length = Math.hypot(...normal);
      if (length < 0.00001) return;
      for (const p of [a, b, c]) vertices.push(...p, ...normal.map(n => n / length), material);
    }
    for (let row = 0; row < 6; row++) for (let col = 0; col < 10; col++) {
      triangle(point(row, col), point(row + 1, col + 1), point(row + 1, col));
      triangle(point(row, col), point(row, col + 1), point(row + 1, col + 1));
    }
  }
  ellipsoid(0, 6.5, 0, TRUNK_RADIUS, 7, TRUNK_RADIUS, 0);
  ellipsoid(-2.4, 14, 0.5, 4.7, 4.1, 4.5, 1);
  ellipsoid(2.6, 15, 0, 4.5, 4.5, 4.2, 2);
  ellipsoid(0, 17.7, -0.6, 4.8, 4.4, 4.6, 3);
  return new Float32Array(vertices);
}
