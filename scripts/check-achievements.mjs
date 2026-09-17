/**
 * Read the Achievement table the way the Lawn does, and say whether it holds
 * together.
 *
 * Three things have to be true of it, and none of them is obvious from
 * reading the table. A bit must belong to one Achievement and never move,
 * because the bit is the whole of the wire format and a Mower that earned bit
 * 9 last month must still read bit 9 as the same thing. Every Achievement
 * must be reachable, or it is a promise the Lawn cannot keep. And the nine
 * Field names must be the nine the map draws, because the table copies them.
 *
 *     node scripts/check-achievements.mjs
 */
import { ACHIEVEMENTS, BLADE_STEPS, BUMP_STEPS, DRIVE_STEPS, FIELD_NAMES, FIELD_SLACK, HARVEST, THRICE, earnedMask, emptyTally, holds } from '../public/achievements.js';
import { FIELD_NAMES as MAP_NAMES, FIELD_SLACK as MAP_SLACK } from '../public/fields.js';

const problems = [];

// The names the table copies are the names the map draws.
if (FIELD_NAMES.join('|') !== MAP_NAMES.join('|')) {
  problems.push(`field names differ from the map:\n    table: ${FIELD_NAMES.join(', ')}\n    map:   ${MAP_NAMES.join(', ')}`);
}

// The Slack a Harvest forgives is the Slack the Tracker forgives.
if (FIELD_SLACK !== MAP_SLACK) {
  problems.push(`the Slack differs from the map: table ${FIELD_SLACK}, map ${MAP_SLACK}`);
}

// One bit, one Achievement, and every bit inside a Uint32.
const byBit = new Map();
for (const achievement of ACHIEVEMENTS) {
  const { bit, name } = achievement;
  if (!Number.isInteger(bit) || bit < 0 || bit > 31) problems.push(`"${name}" holds bit ${bit}, which is not a bit of a Uint32`);
  const taken = byBit.get(bit);
  if (taken) problems.push(`bit ${bit} is held by both "${taken}" and "${name}"`);
  byBit.set(bit, name);
}

// Nothing a Mower has never done is already earned.
const nothing = emptyTally();
for (const achievement of ACHIEVEMENTS) {
  if (achievement.earned(nothing)) problems.push(`"${achievement.name}" is earned by a Mower that has done nothing`);
}
if (earnedMask(nothing) !== 0) problems.push('a Mower that has done nothing holds an Achievement');

// Everything is earned by a Mower that has done everything.
const everything = {
  c: Math.max(...BLADE_STEPS),
  h: FIELD_NAMES.map(() => Math.max(HARVEST, THRICE)),
  d: Math.max(...DRIVE_STEPS),
  b: Math.max(...BUMP_STEPS),
};
const all = earnedMask(everything);
for (const achievement of ACHIEVEMENTS) {
  if (!holds(all, achievement.bit)) problems.push(`"${achievement.name}" cannot be earned at all`);
}

// Every ladder climbs. A step that is not above the one below it is a step
// two Achievements land on at once, which reads as a bug on the screen.
for (const [what, steps] of [['blades', BLADE_STEPS], ['tiles driven', DRIVE_STEPS], ['bumps', BUMP_STEPS]]) {
  for (let i = 1; i < steps.length; i++) {
    if (!(steps[i] > steps[i - 1])) problems.push(`the ${what} ladder does not climb at step ${i}: ${steps[i - 1]} then ${steps[i]}`);
  }
}

// A Harvest of one Field is not a Harvest of another.
for (let field = 0; field < FIELD_NAMES.length; field++) {
  const one = { ...emptyTally(), h: FIELD_NAMES.map((_, k) => (k === field ? HARVEST : 0)) };
  const mask = earnedMask(one);
  const earned = ACHIEVEMENTS.filter((a) => holds(mask, a.bit)).map((a) => a.name);
  if (earned.length !== 1 || earned[0] !== FIELD_NAMES[field]) {
    problems.push(`one Harvest of ${FIELD_NAMES[field]} earns ${earned.length ? earned.join(', ') : 'nothing'}`);
  }
}

console.log(`${ACHIEVEMENTS.length} achievements on ${byBit.size} bits, highest bit ${Math.max(...byBit.keys())}`);
console.log(`one Harvest is ${HARVEST} of a Field; three are ${THRICE.toFixed(2)}`);
for (const achievement of ACHIEVEMENTS) {
  console.log(`  ${String(achievement.bit).padStart(2)}  ${achievement.name.padEnd(18)} ${achievement.blurb}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nThe table holds together.');
