import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TREES, treeAt, TRUNK_RADIUS } from '../public/trees.js';
import { blocked, dryStart, fieldAt } from '../public/fields.js';

const width = 408, height = 272, radius = 2.6 * 0.85;
const client = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const stepSource = client.match(/function stepAshore\(x, y, dx, dy\) \{[\s\S]*?\n\}/)[0];
const step = new Function('obstacle', `${stepSource}; return stepAshore;`)(
  (x, y) => blocked(x, y, width, height, radius));
for (const [index, [tx, ty, scale]] of TREES.entries()) {
  const x = tx * width, y = ty * height, gap = TRUNK_RADIUS * scale + radius;
  assert.equal(fieldAt(x + 5, y, width, height), index, 'A tree belongs inside each field');
  assert(treeAt(x, y, width, height));
  assert.equal(fieldAt(x, y, width, height), -1, 'Earth is excluded from mowing totals');
  assert.equal(fieldAt(x + 1.6 * scale, y, width, height), -1, 'Bare earth extends beyond the trunk');
  const spawn = dryStart(width, height, x, y, radius);
  assert(!blocked(spawn.x, spawn.y, width, height, radius), 'Saved positions escape trunks');
  let position = [x - gap - 2, y];
  for (let i = 0; i < 40; i++) position = step(...position, 0.5, 0);
  assert(position[0] <= x - gap + 1e-9, 'Driving into a trunk stops on the near side');
  const slide = step(x - gap - 0.01, y, 0.5, 0.5);
  assert(slide[1] > y, 'Angled contact slides along a trunk');
  assert(!blocked(...slide, width, height, radius));
}
console.log('Trees: placement, saved positions, head-on collision and sliding passed.');
