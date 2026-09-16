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
- **Regrowth** — the return of Blade Height to 1. A Lawn nobody mows is
  overgrown again the same day.
- **Growth Rate** — the seconds one Tile needs for a full Regrowth, from 2 to
  6 hours. It is a smooth noise over the Lawn, in patches of `PATCH_TILES`,
  so the grass comes back in slow ground and quick ground. It is a pure
  function of the position of the Tile: no one stores it and no one sends it,
  and both sides build the same table.
- **Mower Key** — what says whose Score a Score is. The Lawn makes one, keeps
  the Score under it, and gives it to the Mower to bring back next visit. It
  is not the Score and it is not the name a Mower is seen by.
- **Score** — how many blades one Mower has cut. The Lawn counts them as it
  cuts them. It is the sum of the Blade Height of each Tile of grass the
  Mower took, so tall grass is worth more than stubble.
- **Snapshot** — how far each Tile is through its Regrowth, from 0 to
  `SNAPSHOT_SCALE`, sent as a `Uint16Array`. No two Tiles share a Regrowth, so
  the wire carries the fraction and not the age in seconds. The wire therefore
  stays the same when the Growth Rate changes.

## Why there is no server tick

The Durable Object stores one number per Tile: the epoch second of the last
Mow Stroke. Blade Height is a pure function of `now - mownAt` and the Growth
Rate of the Tile, which is itself a pure function of where the Tile is.
Therefore:

- No timer runs to make the grass grow. The Lawn stays correct while the
  Durable Object hibernates.
- The client uses the same function, so it animates growth with no traffic.
  The server sends only Mow Strokes.
- The state is 13.8 kB (`Uint32Array`), and it stays that size for ever.

An alarm exists, but only to write the state to storage 2 seconds after a
change. It is a debounce, not a simulation step.

## Presence

A Mower reports its position with `{t:"pos"}`. The server relays it and keeps
nothing on disk, because a position has no meaning after the Mower leaves. A
client forgets a Mower it has not heard from for 4 seconds. Hibernation
therefore costs almost nothing: a Lawn that wakes has forgotten where each
Mower stands, and the next Mow Stroke says it again.

## The Lawn decides where a Mower is

A Mow Stroke says where the Mower is now. It does not say where the swath
starts. The server holds a position for each Mower and cuts from there to the
new one, so the start of a swath is always the end of the one before it, and
a client cannot name a place it never drove from.

That position moves no faster than a Mower drives: `MAX_SPEED` Tiles a second,
which is the `MAX_V` of the client. Travel is a budget in Tiles, and not a
limit for each message, because messages come in bursts after a stall and a
Mower held up by the line did drive the whole way. The budget fills at
`MAX_SPEED * SPEED_TOLERANCE` and holds `TRAVEL_BANK_SECONDS` of driving. When
a client says it went further, the server moves it as far as the budget
allows and does not cut the remainder of the swath.

A client that is rewritten thus gets no advantage. It can send a Mow Stroke
every millisecond and still cuts 13 Tiles a second, the same as a thumb on a
phone. A reported position is also pulled back to within reach of the last Mow
Stroke, so each Mower is seen where it mows.

The budget is held under the Mower Key, not under the socket. Windows are free
and hands are not, so the thing that may only be spent once has to belong to
the Mower and not to the connection.

Before this the server only clamped a stroke to `MAX_STROKE` Tiles, measured
back from the end the Mower gave. Forty of those in a second cut 240 Tiles a
second. The clamp also threw away the swath of an honest Mower whose messages
were held up, and told that Mower nothing.

One hole stays open, because it is cheap and what it lets through is not: a
Mower the Lawn has not seen — a new socket, or one the Lawn forgot while it
hibernated — is believed one time. Its first Mow Stroke only says where it
starts and cuts nothing, so the cost of a teleport is one reconnection for one
stroke.

## The Lawn counts the blades

A Mower used to say how much it had cut and the Lawn relayed the number. Any
number would do, so the board was a list of whatever each client typed. The
Lawn now counts the blades itself, in the same loop that cuts them: it already
walks every Tile of the swath, and it already knows the Blade Height of a Tile
from `mownAt` and the Growth Rate. A position report carries no tally any
more, so there is nothing left to forge.

This costs a Mower nothing it did not already pay. The swath the Lawn counts
is the swath the Lawn cut, which is the swath the travel budget allowed. A
client sending a Mow Stroke every millisecond therefore scores *less* than a
thumb on a phone, not more: it spends the same travel and wastes it on strokes
that go nowhere.

Only grass in a Field counts. The paths and the verges between the Fields are
not grass and the client does not draw them as grass, so `fieldAt` is mirrored
in `src/index.ts` from `public/fields.js`, the way the mow maths and the
Growth Rate already are. All three must stay identical.

The client still counts along, so the digits roll without waiting for a round
trip, and the Lawn overwrites that guess four times a second with `{t:"score"}`.
It is the bargain the Snapshot already makes for the Tiles: mow first, and be
put right.

## A Score needs a name to belong to

A Score the Lawn counts is worth nothing if it dies with the socket, and a
name the client chooses is a name a client can take. So the Lawn makes a Mower
Key — one `crypto.randomUUID` — and the browser only carries it. The Lawn takes
a Key back only when it already holds a Score under it, so a Mower cannot name
itself into the Score of another, and a Mower that has never cut a blade has
no Score, gets a fresh Key, and loses nothing by it.

The Key is not the `id` a Mower is seen by. That stays one per socket, so two
tabs of one browser are still two Mowers on the screen.

One Score can only ever be fed by one travel budget, because both hang on the
Key. Ten tabs on one Key cut what one Mower cuts: measured, one tab is let
through at 12 Tiles a second and ten tabs at 18 between them, which is the
refill rate plus the bank draining once. Eleven tabs would be the same.

A tab that brings no Key gets a Key of its own, and so a budget of its own —
but it gets a Score of its own with it, so nothing is concentrated. That is
the whole shape of it: opening windows can only ever make more Mowers, never a
faster one.

Two honest tabs pay for this, and that was chosen with open eyes. They share
one pair of hands: each drives at about three quarters of the speed of a lone
Mower and sees the odd resync. A second tab is rare; a second tab used to farm
is what this is for.

Unlike a position, a Score is written down: it is saved with the Tiles, on the
same debounced alarm. To keep the state of the Lawn bounded the way the Tiles
are, the Lawn keeps `SCORE_KEEP` Scores and forgets the lowest — never one of a
Mower that is driving, so nobody loses a Score while they are earning it.

## The score is a sum, so it must never take a NaN

The score adds one Blade Height for each Tile the Mower cuts. A sum has no
memory of its parts: one addend that is not a number makes every later score
NaN, for as long as the sum stands. On the Lawn that sum now outlives the
page, so one bad addend would follow a Mower between visits.

The same three gates stop this on both sides. `heightAt` on the client and
`bladeHeight` on the Lawn answer 0 for a Tile they cannot date, instead of
NaN. Only a Blade Height above zero is added. And `updateScore` refuses a
score that is not a finite number, so nothing that is not a number reaches the
screen. The board reads the score of another Mower the same way, because `??`
passes a NaN through and only catches a null.

Nothing about the score is kept in the browser any more. A score in
`localStorage` is a score the visitor can write, and the Lawn holds the real
one.

## Agreement between client and server

The client applies a Mow Stroke immediately, before the server confirms it.
The server can refuse a Mow Stroke when the Mower is over the rate budget
(`STROKE_RATE` per second), and it can cut less than the Mower asked for when
the Mower is over its travel budget. Then the two lawns disagree. To correct
this, the server sends a new Snapshot to that Mower. Keep the mow maths in
`src/index.ts` and `public/index.html` identical.

The client sends a maximum of one Mow Stroke per frame. The Mow Stroke covers
the full movement since the last one. A fast drag thus cuts a continuous
swath with few messages.

## Driving with a thumb

A coarse pointer gets a stick in the bottom left corner and two buttons in the
bottom right. The stick is a **direction**, not a wheel: it says where on the
Lawn the Mower must go, and the Mower turns towards that heading as fast as it
can turn. This works because the camera holds one heading. Wheel controls read
as inverted every time the Mower faces the bottom of the screen, which is half
of the time.

The stick gives only the throttle and the steering. The Mower obeys the same
acceleration, drag and turn rate as the keys, so a Mow Stroke from a thumb and
a Mow Stroke from a keyboard are the same thing.

The base of the stick moves to the thumb that touches the zone. A stick with a
fixed base is a stick the thumb must find first, and a thumb that misses drives
the Mower into the hedge.

Three things must stay clear of the thumbs on a small screen: the score, the
title and the credit move to the top, the Lawn keeps the middle, and the World
Quest Tracker folds down to its heading. Folded, the Tracker still says which
Field you are in and how much of it is cut, because that is the part you read
while you drive.

A phone held sideways is 812 x 390: wide enough to pass a width breakpoint and
far too short for the layout behind it. The small layout therefore answers to
both, and the minimap is measured against the height as well as the width.

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
