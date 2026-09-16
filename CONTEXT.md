# The Lawn

One shared lawn on the web. A visitor drags the pointer to mow. The grass grows
back. If nobody mows, the lawn becomes fully overgrown again.

## Ubiquitous language

- **Lawn** — the one shared field. One Durable Object instance, name `the-lawn`.
- **Tile** — one cell of the Lawn. The grid is 72 x 48 = 3456 Tiles.
- **Blade Height** — how tall the grass on a Tile is, from 0 (mown) to 1
  (fully overgrown).
- **Mow Stroke** — the swath between two pointer positions. The Mower cuts a
  capsule with radius `MOW_RADIUS` around that line.
- **Mower** — one connected visitor.
- **Regrowth** — the return of Blade Height to 1. It takes `REGROW_SECONDS`.
- **Snapshot** — the age of each Tile in seconds, sent as a `Uint16Array`.

## Why there is no server tick

The Durable Object stores one number per Tile: the epoch second of the last
Mow Stroke. Blade Height is a pure function of `now - mownAt`. Therefore:

- No timer runs to make the grass grow. The Lawn stays correct while the
  Durable Object hibernates.
- The client uses the same function, so it animates growth with no traffic.
  The server sends only Mow Strokes.
- The state is 13.8 kB (`Uint32Array`), and it stays that size for ever.

An alarm exists, but only to write the state to storage 2 seconds after a
change. It is a debounce, not a simulation step.

## Presence

A Mower reports its position with `{t:"pos"}`. The server relays it and stores
nothing, because a position has no meaning after the Mower leaves. A client
forgets a Mower it has not heard from for 4 seconds. Hibernation therefore
costs nothing: there is no presence state to lose.

## A Mow Stroke has a maximum length

The server clamps every Mow Stroke to `MAX_STROKE` Tiles, measured back from
the end the Mower is at now. A Mower cannot cross the Lawn between two
messages, so a longer stroke is either a bug or an attack.

It was a bug: the client banked the start of a stroke while the socket was
down and sent the whole drive as one segment on reconnect, which cut a
straight swath across everything in between. The client no longer banks while
disconnected, and the server no longer trusts it to.

## Agreement between client and server

The client applies a Mow Stroke immediately, before the server confirms it.
The server can refuse a Mow Stroke when the Mower is over the rate budget
(`STROKE_RATE` per second). Then the two lawns disagree. To correct this, the
server sends a new Snapshot to that Mower. Keep the mow maths in
`src/index.ts` and `public/index.html` identical.

The client sends a maximum of one Mow Stroke per frame. The Mow Stroke covers
the full movement since the last one. A fast drag thus cuts a continuous
swath with few messages.

## Files

- `src/index.ts` — the Worker (routing) and the `Lawn` Durable Object.
- `public/index.html` — the whole client: WebGPU field, driving, socket, HUD.
  The Lawn is drawn as instanced 3D blades under one sun, from a camera that
  follows the Mower's position at a fixed heading. A rotating camera was tried
  and rejected: it makes a Lawn this size unreadable.

## Light

One directional sun, and a shadow map rendered from it each frame: the grass
and the Mowers draw into a 2048x2048 depth texture, and the main pass compares
against it with a 3x3 filter. Before this the Mower had a dark quad painted on
the ground, which the grass then drew over — it read as a rectangle of paint,
not a shadow.

`textureSampleCompare` may only be called from uniform control flow. A guard
that returns early makes the call non-uniform and the shader will not compile;
sample first, then mask the result.

The time of day comes from the server clock, so every Mower is in the same
hour of the same day. A full cycle is 10 minutes.

## Frame rate

Every frame the field grows itself on the GPU. One compute pass turns the
patch into a record per blade — root, lean, width, tint — and writes only the
blades it keeps into a buffer, with the count in the arguments of an indirect
draw. The blades the camera and the sun both miss never reach a vertex
shader, and the blade a vertex belongs to is worked out once, not twenty
times over. Flowers and clover take the same route, and an empty cell is
dropped there instead of drawing zero-sized geometry.

The Lawn itself is a texture, one texel per Tile: Blade Height in red, the
heading of the cut as cosine and sine in green and blue. The sampler does the
bilinear blend that shader code used to do by hand, and the heading takes two
`textureGather` calls instead of four reads and four trigonometric functions.
The texture is rebuilt only when a Mow Stroke touches it, while cut grass
settles, or four times a second — Regrowth cannot move a Blade Height by one
part in 255 faster than that.

The still parts of the ground — verge, lawn edge and the two coarse noises —
are baked into one texture the first time the Lawn says how big it is. Only
the finest grain is still worked out per pixel.

What remains is fill rate. A blade is one or two pixels wide, so the field
multisamples with four samples: without it the blades come apart into
speckles that crawl as the Mower drives. Four is the count every WebGPU
adapter must support, and it costs about 1.3 ms a frame.

Density is then dynamic, the way consoles hold a frame rate, but it never
goes above one device pixel per CSS pixel. Drawing more pixels than the
screen has was tried and dropped: with multisampling it changes almost
nothing that can be seen, it costs 4 ms, and it put the frame on the edge of
the display's interval, where the density rose, missed, and fell back in a
visible pulse. On a screen too large to hold the rate the field draws fewer
pixels instead, down to 0.7, a step at a time, and takes a step back only
after three good seconds.

The measure must be the mean frame gap and not the median: with vsync every
gap is a multiple of the display's interval, so a screen that misses every
second frame still has a median of exactly one interval and reads as
healthy. The HUD is a separate canvas and stays sharp throughout.

## Generated geometry

  A moving patch of procedural geometry must hash its **absolute world cell**,
  never a cell relative to the patch origin. The origin moves with the camera,
  so a relative hash re-randomises every blade each time it steps, and the
  whole field flashes. Thin moving geometry also needs MSAA, and geometry that
  sits on the ground plane needs the ground pushed a hair below it.

  Two WebGPU traps cost an hour here. A shader that uses a WGSL reserved word
  (`out`, `half`) still yields a pipeline object: draws with it are dropped in
  silence, so the screen stays empty with no error. And `layout: "auto"` builds
  a layout from the bindings a shader really reads, so a bind group that offers
  one more is invalid. Keep `getCompilationInfo()` and an error scope around
  pipeline and bind group creation.
- `wrangler.jsonc` — bindings. `/lawn` is the WebSocket; all other paths are
  static assets.

## Commands

    npm run dev        # wrangler dev on port 8788
    npm run typecheck
    npm run deploy
