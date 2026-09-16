export const FIELD_NAMES = [
  'Daisy Hollow', 'Cloverbank',
  'Bramble Meadow', 'Buttercup Rise',
  'The Long Acre', 'Foxglove Pasture',
];

export function fieldAt(x, y, width, height) {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  const across = height * 0.5 + 7 * Math.sin(x * 0.055) + 3 * Math.sin(x * 0.13);
  const along = width * 0.52 + 9 * Math.sin(y * 0.065 + 0.7);
  const branch = height * 0.22 + 5 * Math.sin(x * 0.07 + 1.8);
  const verge = 2.1 + 0.35 * Math.sin(x * 0.19 + y * 0.11);
  if (Math.min(Math.abs(y - across), Math.abs(x - along), Math.abs(y - branch)) <= verge) return -1;
  const row = y < branch ? 0 : y < across ? 1 : 2;
  return row * 2 + (x < along ? 0 : 1);
}

export function buildFields(width, height) {
  const fields = FIELD_NAMES.map(name => ({ name, tiles: [] }));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const id = fieldAt(x + 0.5, y + 0.5, width, height);
    if (id >= 0) fields[id].tiles.push(y * width + x);
  }
  return fields;
}

export function fieldProgress(tiles, heightAt) {
  if (!tiles.length) return 0;
  let remaining = 0;
  for (const i of tiles) {
    // Short stubble counts as cut, so slow regrowth doesn't prevent completion.
    remaining += Math.max(0, Math.min(1, (heightAt(i) - 0.1) / 0.9));
  }
  return 100 * (1 - remaining / tiles.length);
}

export function createFieldQuests() {
  const tracker = document.getElementById('field-quest');
  const title = document.getElementById('field-name');
  const progress = document.getElementById('field-progress');
  const meter = document.getElementById('field-meter');
  const status = document.getElementById('field-status');
  const banner = document.getElementById('field-banner');
  const bannerTitle = document.getElementById('field-banner-name');
  const bannerLabel = document.getElementById('field-banner-label');
  let width = 0, height = 0, fields = [];
  let active = -1, candidate = -1, candidateSince = 0, checkedAt = -Infinity;
  let completed = false, hideBanner;

  function announce(name, label) {
    clearTimeout(hideBanner);
    bannerTitle.textContent = name;
    bannerLabel.textContent = label;
    banner.classList.add('visible');
    hideBanner = setTimeout(() => banner.classList.remove('visible'), 3200);
  }

  return {
    resize(w, h) {
      if (w === width && h === height) return;
      width = w; height = h;
      fields = buildFields(w, h);
      active = candidate = -1;
      tracker.hidden = true;
    },
    update(x, y, now, heightAt, connected) {
      const next = fieldAt(x, y, width, height);
      // Crossing a path keeps the last objective until the next field is entered.
      if (next !== candidate) { candidate = next; candidateSince = now; }
      let entered = false;
      if (next >= 0 && next !== active && now - candidateSince >= 450) {
        active = next; completed = false; entered = true;
        title.textContent = fields[active].name;
        tracker.hidden = false;
        announce(fields[active].name, 'Field quest discovered');
      }
      if (active < 0 || (!entered && now - checkedAt < 500)) return;
      checkedAt = now;
      const value = fieldProgress(fields[active].tiles, heightAt);
      const complete = value >= 100 - 1e-7;
      const display = complete ? '100' : (Math.floor(value * 10) / 10).toFixed(1);
      progress.textContent = `${display}% cut`;
      meter.value = value;
      status.textContent = !connected ? 'Reconnecting…' : complete ? 'Field cleared' : 'Mow the field · shared progress';
      tracker.classList.toggle('complete', complete);
      if (complete && !completed) {
        announce(fields[active].name, entered ? 'Field already cleared' : 'Field quest complete');
        completed = true;
      }
    },
  };
}
