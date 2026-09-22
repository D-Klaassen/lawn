/** A quiet engine and blade bed, built only after a user gesture. */
export function createMowerSound(button) {
  let muted = true;
  try { muted = localStorage.getItem('lawn:muted') !== 'false'; } catch {}
  let audio = null;
  let harvestRate = 0;
  let harvest = 0;
  const label = () => {
    button.textContent = muted ? 'Sound off' : 'Sound on';
    button.setAttribute('aria-pressed', String(!muted));
    button.setAttribute('aria-label', muted ? 'Enable mower sound' : 'Mute mower sound');
  };
  label();

  function build() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) {
      button.textContent = 'Sound unavailable';
      button.disabled = true;
      return null;
    }
    const context = new Audio();
    const master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.ratio.value = 6;
    master.connect(limiter).connect(context.destination);
    // Knocks hang beside the engine and not under it. The master gain follows
    // the mower and sits at zero whenever it is parked, and a ball you sent
    // rolling is still bonking about after you have stopped.
    const knocks = context.createGain();
    knocks.gain.value = 1;
    knocks.connect(limiter);
    const engine = context.createBiquadFilter();
    engine.type = 'lowpass';
    engine.frequency.value = 340;
    engine.Q.value = 0.6;
    const engineGain = context.createGain();
    engineGain.gain.value = 0.22;
    // A resonant body gives the block its weight, under the blades and over the sub.
    const body = context.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 104;
    body.Q.value = 1.1;
    body.gain.value = 2.5;
    engine.connect(engineGain).connect(body).connect(master);
    // Small speakers lose the sawtooth fundamental, so a sine holds the low end on its own.
    const sub = context.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 47;
    const subGain = context.createGain();
    subGain.gain.value = 0.055;
    sub.connect(subGain).connect(master);
    sub.start();
    const tones = [0, 1].map(i => {
      const tone = context.createOscillator();
      tone.type = 'sawtooth';
      tone.frequency.value = 47 + i * 0.8;
      tone.connect(engine);
      tone.start();
      return tone;
    });
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const blades = context.createBiquadFilter();
    blades.type = 'bandpass';
    blades.frequency.value = 700;
    blades.Q.value = 0.55;
    const bladeGain = context.createGain();
    bladeGain.gain.value = 0.04;
    noise.connect(blades).connect(bladeGain).connect(master);
    // Combustion pulses run on the audio clock, not the display frame rate.
    const firing = context.createOscillator();
    firing.frequency.value = 23.5;
    const pulse = context.createGain();
    pulse.gain.value = 0.035;
    firing.connect(pulse).connect(engineGain.gain);
    // The sub shares the pulse, so both layers thump together and read as one engine.
    pulse.connect(subGain.gain);
    firing.start();
    // Low-frequency noise adds small, non-repeating changes within each pulse.
    const flutter = context.createBiquadFilter();
    flutter.type = 'lowpass';
    flutter.frequency.value = 14;
    flutter.Q.value = 0.5;
    const wobble = context.createGain();
    wobble.gain.value = 90;
    noise.connect(flutter).connect(wobble);
    tones.forEach(tone => wobble.connect(tone.detune));
    noise.start();
    return { context, master, knocks, noiseBuffer: buffer, tones, engine, engineGain, body, sub,
      subGain, blades, bladeGain,
      firing, pulse, wobble, nextVariation: 0, drift: 0, roughness: 0, detune: 0.8 };
  }

  async function unlock() {
    if (muted || document.hidden) return;
    try {
      audio ??= build();
      if (audio?.context.state === 'suspended') await audio.context.resume();
    } catch {
      // A denied gesture or interrupted audio session can retry on the next gesture.
    }
  }
  const gesture = event => {
    if (event.target === button || (event.type === 'keydown' && event.repeat)) return;
    void unlock();
  };
  addEventListener('keydown', gesture);
  addEventListener('pointerdown', gesture);
  button.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('lawn:muted', String(muted)); } catch {}
    label();
    if (muted && audio) audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.025);
    else void unlock();
  });
  document.addEventListener('visibilitychange', () => {
    harvest = 0;
    harvestRate = 0;
    if (!audio) return;
    audio.master.gain.setValueAtTime(0, audio.context.currentTime);
    if (document.hidden) void audio.context.suspend().catch(() => {});
    else void unlock();
  });
  addEventListener('pagehide', () => {
    if (audio) void audio.context.suspend().catch(() => {});
  });

  return {
    cut(amount) { harvest += amount; },
    /**
     * The Bonk: a sine dropped fast through its own pitch is what a struck
     * hollow shell sounds like, and the noise over the front of it is the deck
     * arriving. `force` runs 0 to 1, and a nudge has to stay a nudge: it is the
     * only thing telling you how well you caught the ball.
     */
    bonk(force) {
      if (muted || document.hidden || !audio || audio.context.state !== 'running') return;
      const { context, knocks, noiseBuffer } = audio;
      const now = context.currentTime;
      const hit = Math.max(0, Math.min(1, force));
      const ring = 0.1 + hit * 0.14;
      // One ball is hit over and over, so the pitch has to wander. Held fixed,
      // a rally reads as one recording played twice rather than two hits.
      const top = (186 + hit * 108) * (0.93 + Math.random() * 0.14);
      const shell = context.createOscillator();
      shell.type = 'sine';
      shell.frequency.setValueAtTime(top, now);
      shell.frequency.exponentialRampToValueAtTime(top * 0.32, now + ring);
      const shellGain = context.createGain();
      shellGain.gain.setValueAtTime(0.0001, now);
      shellGain.gain.linearRampToValueAtTime(0.16 + hit * 0.38, now + 0.005);
      shellGain.gain.exponentialRampToValueAtTime(0.0001, now + ring);
      shell.connect(shellGain).connect(knocks);
      shell.start(now);
      shell.stop(now + ring + 0.02);
      const slap = context.createBufferSource();
      slap.buffer = noiseBuffer;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1000 + hit * 1600;
      band.Q.value = 0.85;
      const slapGain = context.createGain();
      slapGain.gain.setValueAtTime(0.07 + hit * 0.15, now);
      slapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      slap.connect(band).connect(slapGain).connect(knocks);
      // A fresh window of the same noise each time, or the click is one sample.
      slap.start(now, Math.random() * 1.5, 0.06);
    },
    update(speed, dt, active) {
      // Harvest is accumulated over the frame, so load does not depend on frame rate.
      const target = active ? harvest / Math.max(0.001, dt) : 0;
      harvest = 0;
      harvestRate += (target - harvestRate) * (1 - Math.exp(-dt * 7));
      const load = Math.min(1, harvestRate / 48);
      if (!audio || audio.context.state !== 'running') return;
      const { context, master, tones, engine, engineGain, body, sub, subGain, blades, bladeGain,
        firing, pulse, wobble } = audio;
      const now = context.currentTime;
      const pace = Math.min(1, Math.abs(speed) / 13);
      if (now >= audio.nextVariation) {
        audio.nextVariation = now + 0.12 + Math.random() * 0.3;
        audio.drift = (Math.random() * 2 - 1) * (1.1 - pace * 0.45 + load * 0.7);
        audio.roughness = Math.random();
        audio.detune = 0.45 + Math.random() * 0.85;
      }
      const pitch = 47 + pace * 35 - load * 9 + audio.drift;
      tones.forEach((tone, i) => tone.frequency.setTargetAtTime(pitch + i * audio.detune, now, 0.08));
      firing.frequency.setTargetAtTime(pitch * 0.5, now, 0.06);
      pulse.gain.setTargetAtTime(0.025 + (1 - pace) * 0.02 + load * 0.02, now, 0.1);
      wobble.gain.setTargetAtTime(70 + (1 - pace) * 40 + load * 65, now, 0.1);
      engineGain.gain.setTargetAtTime(0.21 + audio.roughness * 0.025, now, 0.08);
      engine.frequency.setTargetAtTime(280 + pace * 220 + load * 100 + audio.roughness * 65, now, 0.1);
      // The sub follows the fundamental, and an engine that bogs down leans on it harder.
      sub.frequency.setTargetAtTime(pitch, now, 0.05);
      subGain.gain.setTargetAtTime(0.055 + pace * 0.13 + load * 0.2, now, 0.09);
      body.frequency.setTargetAtTime(96 + pace * 74 + load * 26, now, 0.1);
      body.gain.setTargetAtTime(2.5 + pace * 3 + load * 4.5, now, 0.12);
      blades.frequency.setTargetAtTime(650 + pace * 300 + load * 1100, now, 0.06);
      bladeGain.gain.setTargetAtTime(0.035 + pace * 0.035 + load * 0.24, now, 0.06);
      master.gain.setTargetAtTime(active && !muted && !document.hidden ? 0.08 + pace * 0.09 : 0, now, 0.06);
    },
  };
}
