import {
  parseCloseApproaches, parseImpactRisk, summarize,
  sizeComparison, formatSize, formatOdds,
} from './neo.js';
import { createOrbitPanel } from './orbit-panel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (sel) => document.querySelector(sel);

const params = new URLSearchParams(location.search);
const state = {
  days: ['7', '30', '60', '365'].includes(params.get('days')) ? params.get('days') : '30',
  ld: ['1', '5', '10'].includes(params.get('ld')) ? params.get('ld') : '5',
  sort: { key: 'date', dir: 1 },
  list: [],
};
const orbit = createOrbitPanel();

// ---------- formatting ----------
const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ld = (v) => `${v < 0.1 ? v.toFixed(3) : v.toFixed(2)} LD`;
const km = (v) => `${int.format(Math.round(v / 1000) * 1000)} km`;
const jplLink = (a) => `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(a.designation)}`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ---------- data ----------
async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function loadApproaches() {
  const status = $('#status');
  status.className = 'status';
  status.textContent = 'Loading…';
  try {
    const q = new URLSearchParams({ 'date-min': 'now', 'date-max': `+${state.days}`, 'dist-max': `${state.ld}LD` });
    state.list = parseCloseApproaches(await getJson(`/api/close-approaches?${q}`));
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    state.list = [];
    status.className = 'status error';
    status.textContent = err.message;
  }
  render();
}

async function loadRisk() {
  const tbody = $('#risk-table tbody');
  try {
    const rows = parseImpactRisk(await getJson('/api/impact-risk'));
    tbody.replaceChildren(...rows.map((r) => el('tr', {},
      el('td', {}, el('a', { href: jplLink(r) }, r.name)),
      el('td', { class: 'num' }, formatSize({ min: r.diameterM, max: r.diameterM, measured: true })),
      el('td', {}, r.years),
      el('td', { class: 'num' }, formatOdds(r.probability)),
      el('td', { class: 'num' }, r.palermo.toFixed(2)),
    )));
    const watched = rows.filter((r) => r.palermo >= -2).length;
    $('#risk-verdict').textContent = watched === 0
      ? 'Every object here is below −2 right now.'
      : `${watched} ${watched === 1 ? 'is' : 'are'} at or above −2, which means astronomers keep a close eye on ${watched === 1 ? 'it' : 'them'}.`;
  } catch (err) {
    tbody.replaceChildren(el('tr', {}, el('td', { colspan: 5, class: 'empty' }, err.message)));
  }
}

// ---------- render ----------
function render() {
  const keep = state.list.find((a) => a.designation === orbit.selected);
  const pick = keep ?? summarize(state.list)?.closest;
  if (pick) orbit.select(pick);
  renderTiles();
  renderChart();
  renderTable();
}

function select(a) {
  orbit.select(a);
  renderChart();
  renderTable();
  const card = $('#orbit-card');
  if (card.getBoundingClientRect().top > innerHeight - 120) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tile(label, value, sub) {
  return el('div', { class: 'tile' },
    el('div', { class: 'label' }, label),
    el('div', { class: 'value' }, value),
    el('div', { class: 'sub', title: sub }, sub));
}

function renderTiles() {
  const s = summarize(state.list);
  const window = state.days === '365' ? 'the next year' : `the next ${state.days} days`;
  if (!s) {
    $('#tiles').replaceChildren(tile('Passing by', '0', `within ${state.ld} LD in ${window}`));
    return;
  }
  $('#tiles').replaceChildren(
    tile('Passing by', String(s.count), `within ${state.ld} LD in ${window}`),
    tile('Closer than the Moon', String(s.insideMoon), s.insideMoon === 1 ? 'asteroid inside 1 LD' : 'asteroids inside 1 LD'),
    tile('Closest', ld(s.closest.distLd), `${s.closest.name} · ${shortDate.format(s.closest.date)}`),
    tile('Largest', formatSize(s.largest.size), `≈ ${sizeComparison(s.largest.sizeMid)} · ${s.largest.name}`),
  );
}

function logTicks(lo, hi) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 3]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) ticks.push(v);
    }
  }
  return ticks;
}

function renderChart() {
  const host = $('#chart');
  const tooltip = $('#tooltip');
  tooltip.hidden = true;
  const list = state.list;
  if (!list.length) {
    host.replaceChildren(el('div', { class: 'empty' }, 'No asteroids in this window. Try a wider distance or time range.'));
    return;
  }

  const W = Math.max(host.clientWidth, 300);
  const H = W < 600 ? 300 : 380;
  const m = { top: 16, right: 16, bottom: 30, left: 52 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const t0 = Date.now();
  const t1 = t0 + Number(state.days) * 86_400_000;
  const x = (d) => m.left + ((d - t0) / (t1 - t0)) * iw;

  const hi = Number(state.ld);
  const minDist = Math.min(...list.map((a) => a.distLd));
  const lo = Math.min(hi / 10, minDist * 0.7);
  const y = (v) => m.top + ih - ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * ih;

  const maxSize = Math.max(...list.map((a) => a.sizeMid));
  const r = (a) => 4 + 10 * Math.sqrt(a.sizeMid / maxSize);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Scatter chart of ${list.length} asteroid close approaches by date and distance` });

  // Grid and axes
  const grid = svg('g', { class: 'grid' });
  for (const v of logTicks(lo, hi)) {
    grid.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v) }));
    const label = svg('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
    label.textContent = `${v} LD`;
    grid.append(label);
  }
  const step = Math.max(1, Math.round(Number(state.days) / Math.max(2, Math.floor(iw / 90))));
  for (let d = 0; d <= Number(state.days); d += step) {
    const t = t0 + d * 86_400_000;
    const label = svg('text', { x: x(t), y: H - 8, 'text-anchor': d === 0 ? 'start' : 'middle' });
    label.textContent = d === 0 ? 'Today' : shortDate.format(t);
    grid.append(label);
  }
  root.append(grid);

  // Moon reference line
  if (lo < 1 && hi >= 1) {
    root.append(svg('line', { class: 'moon-line', x1: m.left, x2: W - m.right, y1: y(1), y2: y(1) }));
    const label = svg('text', { class: 'moon-label', x: W - m.right, y: y(1) - 6, 'text-anchor': 'end' });
    label.textContent = 'Moon’s distance';
    root.append(label);
  }

  // Dots, biggest first so small ones stay on top
  const sorted = [...list].sort((a, b) => b.sizeMid - a.sizeMid);
  const dots = svg('g');
  const hits = svg('g');
  for (const a of sorted) {
    const cx = x(a.date.getTime());
    const cy = y(a.distLd);
    const dot = svg('circle', { class: a.designation === orbit.selected ? 'dot selected' : 'dot', cx, cy, r: r(a) });
    const hit = svg('circle', { class: 'hit', cx, cy, r: r(a) + 6, tabindex: 0, 'aria-label': `${a.name}, ${ld(a.distLd)}, ${dateFmt.format(a.date)}` });
    const show = () => {
      dot.classList.add('active');
      showTooltip(a, cx, cy, W);
    };
    const hide = () => {
      dot.classList.remove('active');
      tooltip.hidden = true;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
    hit.addEventListener('click', () => select(a));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(a);
      }
    });
    dots.append(dot);
    hits.append(hit);
  }
  root.append(dots, hits);

  // Direct label for the closest approach only
  const c = summarize(list).closest;
  const cx = x(c.date.getTime());
  const flip = cx > W * 0.7;
  const label = svg('text', { class: 'dot-label', x: cx + (flip ? -1 : 1) * (r(c) + 6), y: y(c.distLd) + 4, 'text-anchor': flip ? 'end' : 'start' });
  label.textContent = `Closest: ${c.name}`;
  root.insertBefore(label, hits);

  host.replaceChildren(root);
}

function showTooltip(a, cx, cy, W) {
  const tooltip = $('#tooltip');
  const host = $('#chart');
  const scale = host.clientWidth / W;
  tooltip.replaceChildren(
    el('strong', {}, a.name),
    el('div', {}, dateFmt.format(a.date)),
    el('div', {}, `${ld(a.distLd)} `, el('span', { class: 'muted' }, `(${km(a.distKm)})`)),
    el('div', {}, `${formatSize(a.size)} · about ${sizeComparison(a.sizeMid)}`),
    el('div', {}, `${a.speedKms.toFixed(1)} km/s `, el('span', { class: 'muted' }, `(${int.format(a.speedKms * 3600)} km/h)`)),
    el('div', { class: 'muted' }, a.size.measured ? 'Size measured' : 'Size estimated from brightness'),
  );
  tooltip.hidden = false;
  const left = host.offsetLeft + cx * scale;
  const top = host.offsetTop + cy * scale;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const cardW = host.parentElement.clientWidth;
  tooltip.style.left = `${Math.min(Math.max(8, left - tw / 2), cardW - tw - 8)}px`;
  tooltip.style.top = `${top - th - 14 < 8 ? top + 18 : top - th - 14}px`;
}

function renderTable() {
  const { key, dir } = state.sort;
  const rows = [...state.list].sort((a, b) => {
    const av = key === 'date' ? a.date.getTime() : a[key];
    const bv = key === 'date' ? b.date.getTime() : b[key];
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
  $('#approach-table tbody').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const row = e.target.closest('tr[data-des]');
  const a = row && state.list.find((x) => x.designation === row.dataset.des);
  if (a) select(a);
});

for (const th of document.querySelectorAll('#approach-table th[data-sort]')) {
    th.setAttribute('aria-sort', th.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
  }
  const tbody = $('#approach-table tbody');
  if (!rows.length) {
    tbody.replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'empty' }, 'Nothing to show.')));
    return;
  }
  tbody.replaceChildren(...rows.map((a) => el('tr', {
    class: [a.distLd < 1 && 'inside-moon', a.designation === orbit.selected && 'selected'].filter(Boolean).join(' '),
    'data-des': a.designation,
  },
    el('td', {}, el('a', { href: jplLink(a), target: '_blank', rel: 'noopener' }, a.name)),
    el('td', {}, dateFmt.format(a.date)),
    el('td', { class: 'num' }, ld(a.distLd), el('br'), el('span', { class: 'muted' }, km(a.distKm))),
    el('td', { class: 'num' }, formatSize(a.size), a.size.measured ? '' : el('span', { class: 'muted', title: 'Estimated from brightness' }, ' est.')),
    el('td', {}, sizeComparison(a.sizeMid)),
    el('td', { class: 'num' }, `${a.speedKms.toFixed(1)} km/s`),
  )));
}

// ---------- controls ----------
function syncControls() {
  for (const seg of document.querySelectorAll('.seg[data-filter]')) {
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.value === state[seg.dataset.filter]));
    }
  }
  const q = new URLSearchParams({ days: state.days, ld: state.ld });
  history.replaceState(null, '', `?${q}`);
}

for (const seg of document.querySelectorAll('.seg[data-filter]')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || state[seg.dataset.filter] === b.dataset.value) return;
    state[seg.dataset.filter] = b.dataset.value;
    syncControls();
    loadApproaches();
  });
}

$('#approach-table tbody').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const row = e.target.closest('tr[data-des]');
  const a = row && state.list.find((x) => x.designation === row.dataset.des);
  if (a) select(a);
});

for (const th of document.querySelectorAll('#approach-table th[data-sort]')) {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    renderTable();
  });
}

// Re-draw only when the width changes; redrawing changes the height.
let resizeTimer;
let lastWidth = 0;
new ResizeObserver(([entry]) => {
  const width = Math.round(entry.contentRect.width);
  if (width === lastWidth) return;
  lastWidth = width;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderChart, 120);
}).observe($('#chart'));

syncControls();
loadApproaches();
loadRisk();
