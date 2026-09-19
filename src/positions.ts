import { MAX_SPEED } from './driving';

export const INTERP_DELAY = 50;
export const PREDICT_MS = 150;
export type Position = { x: number; y: number; a: number; vx: number; vy: number };
export type Report = Position & { t: number };

/** Travel can be sideways during a drift, or zero while pushing against a bank. */
export function motion(vx: unknown, vy: unknown): { vx: number; vy: number } | undefined {
  if (typeof vx !== 'number' || typeof vy !== 'number' || !Number.isFinite(vx) || !Number.isFinite(vy)) return;
  const scale = Math.min(1, MAX_SPEED / (Math.hypot(vx, vy) || 1));
  return { vx: vx * scale, vy: vy * scale };
}

/** Keep a short history even when a background tab stops drawing. */
export function addReport(buf: Report[], report: Report): void {
  const last = buf.at(-1);
  if (last && report.t < last.t) return;
  if (last && report.t === last.t) buf.pop();
  buf.push(report);
  if (buf.length > 32) buf.splice(0, buf.length - 32);
}

/** Bridge brief gaps, but never drive a disconnected mower indefinitely. */
export function samplePeer(buf: Report[], time: number): Position | undefined {
  while (buf.length > 2 && buf[1].t <= time) buf.shift();
  const from = buf[0];
  if (!from) return;
  const to = buf[1];
  if (time < from.t) return { ...from, vx: 0, vy: 0 };
  if (to && time < to.t) {
    const k = (time - from.t) / (to.t - from.t);
    const gap = Math.atan2(Math.sin(to.a - from.a), Math.cos(to.a - from.a));
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k,
      a: from.a + gap * k, vx: from.vx + (to.vx - from.vx) * k,
      vy: from.vy + (to.vy - from.vy) * k };
  }
  const last = to ?? from;
  const age = Math.max(0, time - last.t);
  const dt = Math.min(age, PREDICT_MS) / 1000;
  return { x: last.x + last.vx * dt, y: last.y + last.vy * dt, a: last.a,
    vx: age >= PREDICT_MS ? 0 : last.vx, vy: age >= PREDICT_MS ? 0 : last.vy };
}

/** Remember corrections separately so replies for in-flight reports cannot apply them twice. */
export class PositionReports {
  private sequence = 0;
  private offset = { x: 0, y: 0 };
  private pending = new Map<number, { x: number; y: number; ox: number; oy: number }>();

  sent(x: number, y: number): number {
    const seq = ++this.sequence;
    this.pending.set(seq, { x, y, ox: this.offset.x, oy: this.offset.y });
    if (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value!);
    return seq;
  }

  accept(seq: number, x: number, y: number): { x: number; y: number } | undefined {
    const report = this.pending.get(seq);
    if (!report || !Number.isFinite(x) || !Number.isFinite(y)) return;
    for (const key of this.pending.keys()) if (key <= seq) this.pending.delete(key);
    const dx = x - report.x - (this.offset.x - report.ox);
    const dy = y - report.y - (this.offset.y - report.oy);
    this.offset.x += dx;
    this.offset.y += dy;
    return { x: dx, y: dy };
  }
}
