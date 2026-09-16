import { DurableObject } from "cloudflare:workers";

/**
 * The Lawn is one shared field of Tiles. A Tile stores only the moment it was
 * last mown. Blade Height is a pure function of the time since that moment, so
 * nothing ticks: the Lawn keeps growing while the Durable Object hibernates.
 */
const LAWN_WIDTH = 288;
const LAWN_HEIGHT = 192;
const TILE_COUNT = LAWN_WIDTH * LAWN_HEIGHT;

/**
 * Seconds a Tile needs to grow from mown to fully overgrown. No Tile grows at
 * the speed of its neighbour: the Growth Rate moves between these two bounds
 * across the Lawn, so the field comes back uneven, the way a real lawn does.
 */
const REGROW_MIN_SECONDS = 72000;
const REGROW_MAX_SECONDS = 100800;
/**
 * Width of one patch of like-minded grass, in Tiles. Below about ten the
 * Growth Rate reads as speckle on single Tiles instead of as slow ground.
 */
const PATCH_TILES = 16;
/**
 * Full scale of one Snapshot entry. A Regrowth is longer than 65535 seconds,
 * so a Snapshot carries how far a Tile is through its Regrowth, not its age
 * in seconds. One step is about 1.5 seconds, far below one part in 255 of
 * Blade Height.
 */
const SNAPSHOT_SCALE = 65535;

/** One lattice point of the Growth Rate noise, 0 to 1. */
function vigourAt(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Seconds of Regrowth for every Tile. It is a pure function of the position of
 * the Tile, so the client works out the same table and nothing is stored or
 * sent. Both sides hold it as a table because the Lawn is read Tile by Tile,
 * many times a second, and the noise is the same on every read.
 */
function regrowTable(width: number, height: number): Float32Array {
  const table = new Float32Array(width * height);
  const span = REGROW_MAX_SECONDS - REGROW_MIN_SECONDS;
  for (let y = 0; y < height; y++) {
    const gy = y / PATCH_TILES;
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    const fy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < width; x++) {
      const gx = x / PATCH_TILES;
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const fx = tx * tx * (3 - 2 * tx);
      const a = vigourAt(x0, y0);
      const b = vigourAt(x0 + 1, y0);
      const c = vigourAt(x0, y0 + 1);
      const d = vigourAt(x0 + 1, y0 + 1);
      const top = a + (b - a) * fx;
      const bottom = c + (d - c) * fx;
      table[y * width + x] = REGROW_MIN_SECONDS + (top + (bottom - top) * fy) * span;
    }
  }
  return table;
}

const REGROW = regrowTable(LAWN_WIDTH, LAWN_HEIGHT);
/** Radius of one Mow Stroke, in Tiles. */
const MOW_RADIUS = 2.6;
/**
 * Longest swath one Mow Stroke may cut. A Mower cannot cross the Lawn in one
 * message, so the server clamps the stroke to the end the Mower is at now.
 */
const MAX_STROKE = 6;

/** Mow Strokes one Mower may send per second. */
const STROKE_RATE = 40;
/** Shortest gap between two resyncs to the same Mower. */
const RESYNC_GAP_MS = 1000;
/** Position reports one Mower may send per second. */
const POS_RATE = 30;
/** Emotes one Mower may send per second. */
const EMOTE_RATE = 2;
/** How many Emotes the wheel offers. The client holds the pictures. */
const EMOTE_COUNT = 4;
const STORAGE_KEY = "mownAt";
const STROKE_KEY = "strokes";
const PERSIST_DELAY_MS = 2000;

/** A Mow Stroke is the swath swept between two points, not a single dot. */
type ClientMessage =
  | { t: "mow"; x0: number; y0: number; x1: number; y1: number }
  /** Where a Mower is, which way it points, and how much it has cut. */
  | { t: "pos"; x: number; y: number; a: number; s: number }
  /** Which Emote a Mower shows. Relayed, never stored. */
  | { t: "emote"; e: number };

interface Budget {
  tokens: number;
  refilledAt: number;
}

export class Lawn extends DurableObject {
  /** Epoch seconds of the last Mow Stroke per Tile. 0 means never mown. */
  private mownAt!: Uint32Array;
  private strokes = 0;
  private dirty = false;
  private budgets = new WeakMap<WebSocket, Budget>();
  private posBudgets = new WeakMap<WebSocket, Budget>();
  private emoteBudgets = new WeakMap<WebSocket, Budget>();
  private resyncedAt = new WeakMap<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx as never, env as never);
    ctx.blockConcurrencyWhile(async () => {
      const chunks = await ctx.storage.get<ArrayBuffer>([STORAGE_KEY, `${STORAGE_KEY}:1`]);
      const first = chunks.get(STORAGE_KEY);
      const second = chunks.get(`${STORAGE_KEY}:1`);
      let stored = first;
      if (first && second) {
        const joined = new Uint8Array(first.byteLength + second.byteLength);
        joined.set(new Uint8Array(first));
        joined.set(new Uint8Array(second), first.byteLength);
        stored = joined.buffer;
      }
      this.mownAt =
        stored && stored.byteLength === TILE_COUNT * 4
          ? new Uint32Array(stored.slice(0))
          : new Uint32Array(TILE_COUNT);
      const oldWidth = stored?.byteLength === 144 * 96 * 4 ? 144
        : stored?.byteLength === 72 * 48 * 4 ? 72 : 0;
      if (stored && oldWidth) {
        const oldHeight = oldWidth * 2 / 3;
        const previous = new Uint32Array(stored);
        const offsetX = (LAWN_WIDTH - oldWidth) / 2;
        const offsetY = (LAWN_HEIGHT - oldHeight) / 2;
        for (let y = 0; y < oldHeight; y++) {
          this.mownAt.set(previous.subarray(y * oldWidth, (y + 1) * oldWidth), (y + offsetY) * LAWN_WIDTH + offsetX);
        }
        this.schedulePersist();
      }
      this.strokes = (await ctx.storage.get<number>(STROKE_KEY)) ?? 0;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernation: the Lawn sleeps between Mow Strokes and the sockets survive.
    // The id rides on the socket, so it survives hibernation too.
    const id = crypto.randomUUID().slice(0, 8);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    server.send(JSON.stringify(this.hello(id)));
    server.send(this.snapshot());
    this.announceMowers();

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== "string" || raw.length > 256) return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const id = (ws.deserializeAttachment() as { id?: string } | null)?.id ?? "?";

    if (message?.t === "pos") {
      // Presence is ephemeral: relay it, store nothing. A Mower that goes
      // quiet simply fades from the other screens.
      if (!this.spendPos(ws)) return;
      const x = Number(message.x);
      const y = Number(message.y);
      const a = Number(message.a);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) return;
      // The score is the Mower's own tally. The Lawn carries it between
      // screens but never keeps it, exactly like the position.
      const raw = Number(message.s);
      const s = Number.isFinite(raw) && raw > 0 ? Math.floor(Math.min(raw, 1e12)) : 0;
      // Stamp the report. A client draws other Mowers slightly in the past,
      // between two reports, and it needs to know when each one was really
      // made: the gaps between arrivals are network jitter, not movement.
      this.broadcast(JSON.stringify({ t: "peer", id, x, y, a, s, n: Date.now() }), ws);
      return;
    }
    if (message?.t === "emote") {
      // An Emote is presence, like a position: relay it and store nothing.
      // It therefore fades from the other screens on its own, and it costs
      // the hibernating Lawn nothing.
      if (!this.spendEmote(ws)) return;
      const e = Number(message.e);
      if (!Number.isInteger(e) || e < 0 || e >= EMOTE_COUNT) return;
      this.broadcast(JSON.stringify({ t: "emoted", id, e }), ws);
      return;
    }
    if (message?.t !== "mow") return;

    const x0 = Number(message.x0);
    const y0 = Number(message.y0);
    const x1 = Number(message.x1);
    const y1 = Number(message.y1);
    for (const v of [x0, y0, x1, y1]) if (!Number.isFinite(v)) return;
    if (Math.min(x0, x1) < -MOW_RADIUS || Math.max(x0, x1) > LAWN_WIDTH + MOW_RADIUS) return;
    if (Math.min(y0, y1) < -MOW_RADIUS || Math.max(y0, y1) > LAWN_HEIGHT + MOW_RADIUS) return;

    // A Mower over budget gets the Lawn as the server sees it, so an optimistic
    // client never keeps a swath the server refused.
    if (!this.spend(ws)) {
      this.resync(ws);
      return;
    }

    const [cx0, cy0] = clampStroke(x0, y0, x1, y1);
    this.mow(cx0, cy0, x1, y1);
    this.strokes += 1;
    this.broadcast(
      JSON.stringify({ t: "mow", x0: cx0, y0: cy0, x1, y1, by: id, strokes: this.strokes }),
      ws,
    );
    this.schedulePersist();
  }

  webSocketClose(ws: WebSocket): void {
    const id = (ws.deserializeAttachment() as { id?: string } | null)?.id;
    if (id) this.broadcast(JSON.stringify({ t: "gone", id }), ws);
    this.announceMowers();
  }

  webSocketError(): void {
    this.announceMowers();
  }

  async alarm(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    // Each storage value stays below 128 KiB; save both chunks atomically.
    await this.ctx.storage.put({
      [STORAGE_KEY]: this.mownAt.buffer.slice(0, 128 * 1024),
      [`${STORAGE_KEY}:1`]: this.mownAt.buffer.slice(128 * 1024),
      [STROKE_KEY]: this.strokes,
    });
  }

  /** Cut every Tile the swath touches back to zero Blade Height. */
  private mow(x0: number, y0: number, x1: number, y1: number): void {
    const now = Math.floor(Date.now() / 1000);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - MOW_RADIUS));
    const maxX = Math.min(LAWN_WIDTH - 1, Math.ceil(Math.max(x0, x1) + MOW_RADIUS));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - MOW_RADIUS));
    const maxY = Math.min(LAWN_HEIGHT - 1, Math.ceil(Math.max(y0, y1) + MOW_RADIUS));

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / len2));
        const ox = px - t * dx;
        const oy = py - t * dy;
        if (ox * ox + oy * oy <= MOW_RADIUS * MOW_RADIUS) {
          this.mownAt[y * LAWN_WIDTH + x] = now;
        }
      }
    }
  }

  private resync(ws: WebSocket): void {
    const now = Date.now();
    if (now - (this.resyncedAt.get(ws) ?? 0) < RESYNC_GAP_MS) return;
    this.resyncedAt.set(ws, now);
    try {
      ws.send(this.snapshot());
    } catch {
      /* socket is going away */
    }
  }

  private hello(id: string) {
    return {
      t: "hello",
      id,
      w: LAWN_WIDTH,
      h: LAWN_HEIGHT,
      regrowMin: REGROW_MIN_SECONDS,
      regrowMax: REGROW_MAX_SECONDS,
      patch: PATCH_TILES,
      radius: MOW_RADIUS,
      now: Date.now(),
      mowers: this.ctx.getWebSockets().length,
      strokes: this.strokes,
    };
  }

  /** How far every Tile is through its Regrowth, 0 to SNAPSHOT_SCALE. */
  private snapshot(): ArrayBuffer {
    const now = Math.floor(Date.now() / 1000);
    const ages = new Uint16Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) {
      const mown = this.mownAt[i];
      const regrow = REGROW[i];
      const age = mown === 0 ? regrow : now - mown;
      const grown = age >= regrow ? 1 : age < 0 ? 0 : age / regrow;
      ages[i] = Math.round(grown * SNAPSHOT_SCALE);
    }
    return ages.buffer;
  }

  private schedulePersist(): void {
    if (this.dirty) return;
    this.dirty = true;
    void this.ctx.storage.setAlarm(Date.now() + PERSIST_DELAY_MS);
  }

  private spend(ws: WebSocket): boolean {
    return this.take(this.budgets, ws, STROKE_RATE);
  }

  private spendPos(ws: WebSocket): boolean {
    return this.take(this.posBudgets, ws, POS_RATE);
  }

  private spendEmote(ws: WebSocket): boolean {
    return this.take(this.emoteBudgets, ws, EMOTE_RATE);
  }

  private take(budgets: WeakMap<WebSocket, Budget>, ws: WebSocket, rate: number): boolean {
    const now = Date.now();
    const budget = budgets.get(ws) ?? { tokens: rate, refilledAt: now };
    budget.tokens = Math.min(rate, budget.tokens + ((now - budget.refilledAt) / 1000) * rate);
    budget.refilledAt = now;
    budgets.set(ws, budget);
    if (budget.tokens < 1) return false;
    budget.tokens -= 1;
    return true;
  }

  private announceMowers(): void {
    // webSocketClose fires before the socket leaves the list.
    const sockets = this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
    const message = JSON.stringify({ t: "mowers", mowers: sockets.length });
    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch {
        /* socket is going away */
      }
    }
  }

  private broadcast(message: string, except?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(message);
      } catch {
        /* socket is going away */
      }
    }
  }
}

/** Keep the far end of a Mow Stroke within reach of where the Mower is now. */
function clampStroke(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x0 - x1;
  const dy = y0 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= MAX_STROKE) return [x0, y0];
  const k = MAX_STROKE / len;
  return [x1 + dx * k, y1 + dy * k];
}

export interface Env {
  LAWN: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/lawn") {
      // One Lawn for the whole world.
      const id = env.LAWN.idFromName("the-lawn");
      return env.LAWN.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
