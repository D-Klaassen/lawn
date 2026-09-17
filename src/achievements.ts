/**
 * What a Mower has done on the Lawn, and what the Lawn gives it for doing it.
 *
 * An Achievement is a thing the Lawn saw one Mower do, kept under the Mower
 * Key beside the Score. The Lawn awards it; a Mower never claims one. That is
 * the whole of the design: the board already learned that a client asked what
 * its score is answers seven hundred million, and an Achievement a client can
 * claim is worth exactly as much.
 *
 * This file is the one table, and it has two readers — the Lawn, which
 * decides what is earned, and the client, which draws it. It is built to
 * `public/achievements.js` exactly as `src/ball.ts` is built to
 * `public/ball.js`, so neither side can drift from the other. It touches no
 * DOM, which is why it can be shared where `public/fields.js` had to be
 * mirrored.
 */

/**
 * The names of the nine Fields, in the reading order of the map. A copy of
 * `FIELD_NAMES` in `public/fields.js`, which cannot be imported here because
 * it draws the minimap and the tracker and so reaches for the DOM.
 * `scripts/check-achievements.mjs` proves the two lists are the same.
 */
export const FIELD_NAMES = [
  'Daisy Hollow', 'Cloverbank', 'Heron Reach',
  'Bramble Meadow', 'Buttercup Rise', 'Willow Bend',
  'The Long Acre', 'Foxglove Pasture', 'Mill Green',
];

/**
 * What the Lawn counts for one Mower. Every one of these only ever grows, so
 * an Achievement once earned can never be lost.
 */
export interface Tally {
  /** Blades cut, over every visit. It is the Score. */
  c: number;
  /** Harvests of each Field, in the order of `FIELD_NAMES`. */
  h: number[];
  /** Tiles driven, as the Lawn drove the Mower and not as it claimed. */
  d: number;
  /** Bumps the Lawn saw for itself. */
  b: number;
}

/**
 * The last part in a hundred of a Field, which may stand and the Field still
 * count as cut. A copy of `FIELD_SLACK` in `public/fields.js`, which the World
 * Quest Tracker already measures against; `scripts/check-achievements.mjs`
 * proves the two are the same.
 */
export const FIELD_SLACK = 0.01;

/**
 * One Harvest: a whole Field's worth of Blade Height, taken off that Field by
 * one Mower, less the Slack.
 *
 * It is not the same thing as the Field reading 100% on the World Quest
 * Tracker. The Tracker says how the Field stands, which is everybody's work
 * together; a Harvest says what one Mower took off it, which is nobody else's.
 * A Field is about eleven thousand Tiles, so one Harvest is some three minutes
 * of unbroken mowing on standing grass — and because the Lawn holds the
 * fraction and not a flag, the Harvest of a Mower that cuts half a Field today
 * and half of it next week still comes to one.
 *
 * The Slack is here for the reason it is on the Tracker, and for a second
 * reason besides. A Mow Stroke is a capsule and a Field boundary is a curve,
 * so the edge of a Field cannot be cut clean: a Mower that drives the whole
 * parcel in rows four Tiles apart takes 99.8% of it off and no more, measured.
 * Asking for the last blade would make the end of a Harvest what the end of a
 * quest used to be — searching, not mowing — and it would make the perfect
 * drive fall short, which is worse than searching.
 */
export const HARVEST = 1 - FIELD_SLACK;

/** Harvests from one Field that say the Mower came back after the Regrowth. */
export const THRICE = 3 * HARVEST;

/** Blades cut, for each step of the ladder. */
export const BLADE_STEPS = [1000, 20000, 200000, 1000000];
/** Tiles driven, for each step of the ladder. */
export const DRIVE_STEPS = [1000, 10000, 100000, 500000];
/**
 * Bumps seen, for each step of the ladder. A Bump buys `STUN_GRACE_MS` of
 * Grace, so the fastest honest run at the top step is some ten minutes of
 * nothing but ramming.
 */
export const BUMP_STEPS = [5, 40, 200];

export interface Achievement {
  /** Which bit of the mask this one holds. It must never be reassigned. */
  bit: number;
  name: string;
  blurb: string;
  earned(tally: Tally): boolean;
}

/**
 * Every Achievement, by the bit it holds.
 *
 * The bit is the whole of the wire format, so a bit is never reused and never
 * renumbered: a Mower that earned bit 9 last month must still read bit 9 as
 * the same thing. A new Achievement takes the next free bit, and a retired one
 * leaves its bit standing empty.
 */
export const ACHIEVEMENTS: Achievement[] = [
  // 0-8: one per Field, in the reading order of the map.
  ...FIELD_NAMES.map((name, field) => ({
    bit: field,
    name,
    blurb: `One Harvest: a whole Field's worth of grass off ${name}.`,
    earned: (tally: Tally) => (tally.h[field] ?? 0) >= HARVEST,
  })),
  {
    bit: 9,
    name: 'The Whole Lawn',
    blurb: 'One Harvest from every one of the nine Fields.',
    earned: (tally) => FIELD_NAMES.every((_, field) => (tally.h[field] ?? 0) >= HARVEST),
  },
  {
    bit: 10,
    name: 'It Grew Back',
    blurb: 'Three Harvests from one Field. The grass returns; so must you.',
    earned: (tally) => tally.h.some((harvests) => harvests >= THRICE),
  },
  ...['First Cut', 'Grass Stains', 'Deep Green', 'The Long Season'].map((name, step) => ({
    bit: 11 + step,
    name,
    blurb: `Cut ${BLADE_STEPS[step].toLocaleString('en-GB')} blades.`,
    earned: (tally: Tally) => tally.c >= BLADE_STEPS[step],
  })),
  ...['Round the Block', 'Out and Back', 'The Long Way', 'Nine Fields Wide'].map((name, step) => ({
    bit: 15 + step,
    name,
    blurb: `Drive ${DRIVE_STEPS[step].toLocaleString('en-GB')} Tiles.`,
    earned: (tally: Tally) => tally.d >= DRIVE_STEPS[step],
  })),
  ...['Paint Swap', 'Rough Ground', 'Demolition Derby'].map((name, step) => ({
    bit: 19 + step,
    name,
    blurb: `Be in ${BUMP_STEPS[step].toLocaleString('en-GB')} Bumps.`,
    earned: (tally: Tally) => tally.b >= BUMP_STEPS[step],
  })),
];

/** A Mower that has done nothing yet. */
export function emptyTally(): Tally {
  return { c: 0, h: new Array(FIELD_NAMES.length).fill(0), d: 0, b: 0 };
}

/**
 * Which Achievements a Tally has earned, as a bit per Achievement.
 *
 * It is worked out from the Tally every time rather than remembered, so a new
 * Achievement is awarded to every Mower that already deserves it the moment it
 * is added. The caller still ORs the answer into what it holds: an Achievement
 * is for ever, and a threshold that moves must never take one back.
 */
export function earnedMask(tally: Tally): number {
  let mask = 0;
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.earned(tally)) mask |= 1 << achievement.bit;
  }
  return mask >>> 0;
}

/** Whether a mask holds one Achievement. */
export function holds(mask: number, bit: number): boolean {
  return (mask & (1 << bit)) !== 0;
}
