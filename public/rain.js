const RAIN_SIDE = 40;
const RAIN_CELL = 2.25;
export const RAIN_COUNT = RAIN_SIDE * RAIN_SIDE;

// Shares the field's camera and depth buffer. Absolute cells keep drops in
// place when the patch follows the mower; only its outer rows are replaced.
export const RAIN_WGSL = `
struct RainOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
  @location(1) alpha : f32,
  @location(2) @interpolate(flat) splash : u32,
};

@vertex
fn vs_rain(@builtin(vertex_index) vi : u32, @builtin(instance_index) ii : u32) -> RainOut {
  let corners = array<vec2f, 6>(vec2f(-1, 0), vec2f(1, 0), vec2f(-1, 1),
    vec2f(1, 0), vec2f(1, 1), vec2f(-1, 1));
  let uv = corners[vi % 6u];
  let cell = floor(C.weather.zw / ${RAIN_CELL}) + vec2f(f32(ii % ${RAIN_SIDE}u), f32(ii / ${RAIN_SIDE}u)) - ${RAIN_SIDE / 2}.0;
  let seed = hash4(cell + vec2f(71.3, 19.7));
  let speed = mix(15.0, 21.0, seed.z);
  let fallTime = 18.0 / speed;
  let cycleTime = fallTime + 0.24;
  let clock = C.weather.y + seed.w * cycleTime;
  let age = fract(clock / cycleTime) * cycleTime;
  let scatter = hash4(cell + floor(clock / cycleTime) * vec2f(13.7, 37.1));
  let landing = (cell + scatter.xy) * ${RAIN_CELL};
  let edge = 1.0 - smoothstep(34.0, 42.0, length(landing - C.weather.zw));
  let amount = smoothstep(seed.x * 0.8, seed.x * 0.8 + 0.2, C.weather.x);
  var o : RainOut;
  o.uv = uv;
  o.splash = select(0u, 1u, vi >= 6u);
  o.alpha = amount * edge;
  var world : vec3f;
  if (vi < 6u) {
    let height = max(0.0, 18.0 - age * speed);
    let tail = min(18.0, height + uv.y * mix(0.45, 0.85, seed.y));
    let wind = vec2f(0.14, 0.045);
    let centre = vec3f(landing.x - wind.x * tail, tail + 0.035, landing.y - wind.y * tail);
    let axis = normalize(vec3f(-wind.x, 1.0, -wind.y));
    let side = normalize(cross(axis, C.eye.xyz - centre));
    world = centre + side * uv.x * mix(0.026, 0.038, seed.z);
    o.alpha *= select(0.0, 0.52, age < fallTime) * (1.0 - smoothstep(16.5, 18.0, height));
  } else {
    let t = clamp((age - fallTime) / 0.24, 0.0, 1.0);
    let ring = vec2f(uv.x, uv.y * 2.0 - 1.0);
    let radius = mix(0.06, 0.32, t);
    world = vec3f(landing.x + ring.x * radius, 0.035, landing.y + ring.y * radius);
    o.uv = ring;
    o.alpha *= select(0.0, 0.36, age >= fallTime) * (1.0 - t);
  }
  // Close drops fade before they can become large streaks across the view.
  o.alpha *= smoothstep(8.0, 16.0, distance(world, C.eye.xyz));
  o.pos = C.viewProj * vec4f(world, 1.0);
  return o;
}

@fragment
fn fs_rain(i : RainOut) -> @location(0) vec4f {
  var coverage : f32;
  if (i.splash == 1u) {
    let r = length(i.uv);
    coverage = smoothstep(0.62, 0.78, r) * (1.0 - smoothstep(0.82, 1.0, r));
  } else {
    let width = mix(0.9, 0.2, i.uv.y);
    coverage = (1.0 - smoothstep(0.0, width, abs(i.uv.x)))
      * smoothstep(0.0, 0.12, i.uv.y) * (1.0 - smoothstep(0.25, 1.0, i.uv.y));
  }
  return vec4f(0.72, 0.84, 0.9, coverage * i.alpha);
}
`;
