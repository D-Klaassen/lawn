import sharp from 'sharp';

const { data, info } = await sharp('public/assets/quest-card.png')
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const selected = new Uint8Array(width * height);
const queue = new Uint32Array(width * height);
const seed = Math.floor(height / 2) * width + Math.floor(width / 2);
let head = 0, tail = 1;
queue[0] = seed;
selected[seed] = 1;
function visit(i) {
  if (selected[i]) return;
  const p = i * 4;
  const [r, g, b, a] = data.subarray(p, p + 4);
  // Only remove the connected dark-green inset, preserving isolated leaves.
  if (a > 100 && r < 130 && g < 160 && g > r * 1.1 && g > b * 1.05) {
    selected[i] = 1;
    queue[tail++] = i;
  }
}
while (head < tail) {
  const i = queue[head++], x = i % width, y = Math.floor(i / width);
  if (x > 0) visit(i - 1);
  if (x < width - 1) visit(i + 1);
  if (y > 0) visit(i - width);
  if (y < height - 1) visit(i + width);
}
if (tail < width * height * 0.5 || tail > width * height * 0.85) {
  throw new Error(`Unexpected opening size: ${tail} pixels`);
}
const mask = Buffer.alloc(data.length);
for (let i = 0; i < selected.length; i++) {
  if (!selected[i]) continue;
  data[i * 4 + 3] = 0;
  mask.fill(255, i * 4, i * 4 + 4);
}
await sharp(data, { raw: info }).png().toFile('public/assets/minimap-frame.png');
await sharp(mask, { raw: info }).png().toFile('public/assets/minimap-opening.png');
console.log(`Removed ${tail} connected inset pixels; preserved the original artwork.`);
