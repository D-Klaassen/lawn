/**
 * Read the map the way a Mower does, and say whether it holds together.
 *
 * A Ditch that cannot be crossed is only fair while every Field can still be
 * reached. This walks the Lawn from one dry Tile and reports what it could
 * not get to, along with how much of the Lawn is water, lane and grass.
 *
 *     node scripts/check-map.mjs [width] [height]
 */
import { FIELD_NAMES, placeAt, blocked } from '../public/fields.js';

const W = Number(process.argv[2] ?? 408);
const H = Number(process.argv[3] ?? 272);
const RADIUS = 2.6 * 0.85;   // COLLISION_RADIUS in the client
const MOW = 2.6;             // MOW_RADIUS: a Mower cuts this far from itself

const field = new Int8Array(W * H);
const wet = new Float32Array(W * H);
const open = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const place = placeAt(x + 0.5, y + 0.5, W, H);
  field[y * W + x] = place.field;
  wet[y * W + x] = place.wet;
  open[y * W + x] = blocked(x + 0.5, y + 0.5, W, H, RADIUS) ? 0 : 1;
}

// Where a Mower can drive, from the middle of the Lawn outwards.
const seen = new Uint8Array(W * H);
let start = -1;
for (let r = 0; r < W && start < 0; r++) {
  for (let a = 0; a < 64 && start < 0; a++) {
    const x = Math.round(W / 2 + Math.cos(a) * r), y = Math.round(H / 2 + Math.sin(a) * r);
    if (x >= 0 && y >= 0 && x < W && y < H && open[y * W + x]) start = y * W + x;
  }
}
const stack = [start];
seen[start] = 1;
while (stack.length) {
  const i = stack.pop();
  const x = i % W, y = (i / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx;
    if (seen[j] || !open[j]) continue;
    seen[j] = 1;
    stack.push(j);
  }
}

// A Tile is cut from where a Mower can stand, not only where it stands.
const mowable = new Uint8Array(W * H);
const reach = Math.ceil(MOW);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!seen[y * W + x]) continue;
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    if (dx * dx + dy * dy > MOW * MOW) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) mowable[ny * W + nx] = 1;
  }
}

const counts = FIELD_NAMES.map(() => ({ tiles: 0, reached: 0 }));
let water = 0, bare = 0, grass = 0, cutOff = 0;
for (let i = 0; i < W * H; i++) {
  if (wet[i] > 0) water++;
  else if (field[i] < 0) bare++;
  else {
    grass++;
    counts[field[i]].tiles++;
    if (mowable[i]) counts[field[i]].reached++;
  }
  if (open[i] && !seen[i]) cutOff++;
}

const total = W * H;
console.log(`Lawn ${W} x ${H} = ${total} Tiles`);
console.log(`  grass ${grass} (${(100 * grass / total).toFixed(1)}%)`);
console.log(`  lane and bank ${bare} (${(100 * bare / total).toFixed(1)}%)`);
console.log(`  water ${water} (${(100 * water / total).toFixed(1)}%)`);
console.log(`  dry ground a Mower cannot reach: ${cutOff} Tiles`);
for (const [i, name] of FIELD_NAMES.entries()) {
  const { tiles, reached } = counts[i];
  const share = tiles ? (100 * reached / tiles).toFixed(1) : '0.0';
  console.log(`  ${name.padEnd(18)} ${String(tiles).padStart(6)} Tiles, ${share}% mowable`);
}

// A picture of it, one character per few Tiles.
const step = Math.ceil(W / 118);
let picture = '';
for (let y = 0; y < H; y += step * 2) {
  for (let x = 0; x < W; x += step) {
    const i = y * W + x;
    picture += wet[i] > 0 ? '~' : field[i] < 0 ? '.' : String.fromCharCode(48 + field[i]);
  }
  picture += '\n';
}
console.log(picture);
