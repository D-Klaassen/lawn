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
  const banner = document.getElementById('field-banner');
  const bannerTitle = document.getElementById('field-banner-name');
  const bannerLabel = document.getElementById('field-banner-label');
  const list = document.getElementById('world-quest-list');
  const summary = document.getElementById('world-quest-summary');
  let width = 0, height = 0, fields = [];
  let rows = [];
  let active = -1, candidate = -1, candidateSince = 0, checkedAt = -Infinity;
  let hideBanner;

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
      checkedAt = -Infinity;
      rows = fields.map(field => {
        const row = document.createElement('li');
        row.className = 'world-quest';
        row.innerHTML = `<span class="world-quest-badge" aria-hidden="true"></span><div class="world-quest-copy"><div class="world-quest-heading"><span class="world-quest-title"></span><span class="world-quest-percent">0%</span></div><span class="world-quest-status"></span><progress max="100" value="0"></progress></div>`;
        row.querySelector('.world-quest-title').textContent = field.name;
        const meter = row.querySelector('progress');
        meter.setAttribute('aria-label', `${field.name} grass cut`);
        return { row, meter, badge: row.querySelector('.world-quest-badge'), status: row.querySelector('.world-quest-status'), percent: row.querySelector('.world-quest-percent'), completed: false };
      });
      list.replaceChildren(...rows.map(({ row }) => row));
      summary.textContent = '0 / 6 completed';
    },
    update(x, y, now, heightAt) {
      const next = fieldAt(x, y, width, height);
      // Crossing a path keeps the last objective until the next field is entered.
      if (next !== candidate) { candidate = next; candidateSince = now; }
      let entered = false;
      if (next >= 0 && next !== active && now - candidateSince >= 450) {
        active = next; entered = true;
        announce(fields[active].name, 'Field quest discovered');
        rows.forEach(({ row }, id) => row.classList.toggle('active', id === active));
      }
      if (!entered && now - checkedAt < 500) return;
      checkedAt = now;
      rows.forEach((quest, id) => {
        if (quest.completed) return;
        const value = fieldProgress(fields[id].tiles, heightAt);
        const complete = value >= 100 - 1e-7;
        // Reserve 100% for completion, even when the remaining grass rounds away.
        const percent = complete ? 100 : Math.min(99, Math.floor(value + 1e-7));
        quest.meter.value = value;
        quest.percent.textContent = `${percent}%`;
        if (!complete) return;
        quest.completed = true;
        quest.row.classList.add('completed');
        quest.badge.textContent = '✓';
        quest.status.textContent = 'Completed';
        announce(fields[id].name, 'World quest completed');
      });
      summary.textContent = `${rows.filter(quest => quest.completed).length} / ${fields.length} completed`;
    },
  };
}
