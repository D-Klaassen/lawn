import 'number-flow';
import { continuous } from 'number-flow/plugins';

const score = document.querySelector('#score number-flow');
score.format = { maximumFractionDigits: 0, useGrouping: true };
score.trend = 1;
score.plugins = [continuous];
score.transformTiming = { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
score.spinTiming = { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
score.opacityTiming = { duration: 180, easing: 'ease-out' };
score.update(0);

let shown = 0;
let updatedAt = -Infinity;

/**
 * Put a whole tally on the screen without rolling to it. The Lawn holds the
 * score and says it on arrival: that is a score the visitor already had, not
 * grass they are cutting now, so the digits must not count up to it.
 */
export function landScore(value) {
  if (!Number.isFinite(value) || value < 0) return;
  const next = Math.round(value);
  score.animated = false;
  score.update(next);
  requestAnimationFrame(() => { score.animated = true; });
  shown = next;
}

/**
 * Roll the digits towards a tally. Nothing is stored: a score kept in the
 * browser is a score the visitor can write, and the Lawn counts the blades
 * itself now.
 */
export function updateScore(value, now) {
  // A score that is not a number never reaches the screen. It would stay
  // there until the visitor reloads.
  if (!Number.isFinite(value) || value < 0) return;
  const next = Math.round(value);
  // Batch rapid cuts so the digits get time to roll between updates.
  if (next === shown || now - updatedAt < 120) return;
  score.update(next);
  shown = next;
  updatedAt = now;
}
