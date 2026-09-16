import 'number-flow';
import { continuous } from 'number-flow/plugins';

const SCORE_KEY = 'lawn:score';
function readScore() {
  try {
    const value = Number(localStorage.getItem(SCORE_KEY));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export const initialScore = readScore();
let latest = initialScore;
let saved = initialScore;
let savedAt = -Infinity;

function saveScore() {
  if (latest === saved) return;
  try {
    localStorage.setItem(SCORE_KEY, String(latest));
    saved = latest;
  } catch { /* The score still works when browser storage is unavailable. */ }
}

addEventListener('pagehide', saveScore);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveScore();
});

const score = document.querySelector('#score number-flow');
score.format = { maximumFractionDigits: 0, useGrouping: true };
score.trend = 1;
score.plugins = [continuous];
score.transformTiming = { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
score.spinTiming = { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
score.opacityTiming = { duration: 180, easing: 'ease-out' };
score.update(initialScore);

let shown = Math.round(initialScore);
let updatedAt = -Infinity;

export function updateScore(value, now) {
  latest = value;
  if (now - savedAt >= 500) { saveScore(); savedAt = now; }
  const next = Math.round(value);
  // Batch rapid cuts so the digits get time to roll between updates.
  if (next === shown || now - updatedAt < 120) return;
  score.update(next);
  shown = next;
  updatedAt = now;
}
