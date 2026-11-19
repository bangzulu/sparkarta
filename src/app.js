/* =========================================================================
   SPÅRKARTA – RENDERING, ZOOM/PAN, MARKERING, FORDON
   ========================================================================= */
(function () {
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const svg = $('#map'), vp = $('#viewport');
const W0 = 2835, H0 = 1984;
const R_CORNER = 20, LW = 10.5;

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/* ---------- Data → modell ---------- */
const ST = {};
for (const id in STATIONS_RAW) {
  const [name, x, y, lab] = STATIONS_RAW[id];
  ST[id] = { id, name, x, y, lab, lines: new Set(), pts: [] };
}
const LINE = {};
const colorOf = l => COLORS[l.c][0];

LINES.forEach(l => {
  LINE[l.id] = l;
  // lös upp punkter
  const nodes = l.path.map(e => {
    if (typeof e === 'string') { if (!ST[e]) throw new Error('Okänd station ' + e); return { st: e, x: ST[e].x, y: ST[e].y }; }
    if (typeof e[0] === 'string') { if (!ST[e[0]]) throw new Error('Okänd station ' + e[0]); return { st: e[0], x: e[1], y: e[2] }; }
    return { x: e[0], y: e[1] };
  });
  l.stops = nodes.filter(n => n.st).map(n => n.st);
  l.stops.forEach(s => ST[s].lines.add(l.id));
  // tät polyline med rundade hörn i kurvpunkter
  const pts = [], stopIdx = [];
  nodes.forEach((n, i) => {
    if (n.st || i === 0 || i === nodes.length - 1) {
      pts.push([n.x, n.y]);
      if (n.st) { stopIdx.push(pts.length - 1); ST[n.st].pts.push([n.x, n.y]); }
      return;
    }
    const P = nodes[i - 1], N = nodes[i + 1];
    const a = [P.x - n.x, P.y - n.y], b = [N.x - n.x, N.y - n.y];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const r = Math.min(R_CORNER, la / 2, lb / 2);
    const A = [n.x + a[0] / la * r, n.y + a[1] / la * r], B = [n.x + b[0] / lb * r, n.y + b[1] / lb * r];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      pts.push([u * u * A[0] + 2 * u * t * n.x + t * t * B[0], u * u * A[1] + 2 * u * t * n.y + t * t * B[1]]);
    }
  });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  l.route = { pts, stopIdx, cum };
});
const PILL_OF = {};
PILLS.forEach(p => p[0].forEach(s => PILL_OF[s] = true));

/* ---------- Rendering ---------- */
const g = id => $('#' + id);
const routeEls = {}, stationEls = {}, decoEls = {};
const pathD = pts => 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');

// Rubrik
const title = el('text', { x: 622, y: 168, class: 'title' }, g('gDeco'));
title.innerHTML = 'Stockholm · Spårtrafikkarta <tspan class="y" dx="20">Rail Network Map</tspan>';
el('line', { x1: 618, y1: 228, x2: 2738, y2: 228, class: 'rule' }, g('gDeco'));

// Linjer (ritas i omvänd ordning så att tunnelbana hamnar ovanpå)
const ORDER = ['30', '31', '12', '7', '21', '25', '26', '27', '28', '29', '48', '43', '41', '40', '10', '11', '17', '18', '19', '13', '14'];
ORDER.forEach(id => {
  const l = LINE[id], [c, stripe] = COLORS[l.c];
  const grp = el('g', { class: 'route', 'data-line': id }, g('gRoutes'));
  const d = pathD(l.route.pts);
  const w = l.c === 'roslag' ? 9.5 : LW;
  el('path', { d, stroke: c, 'stroke-width': w }, grp);
  (l.extra || []).forEach(ex => el('path', { d: pathD(ex), stroke: c, 'stroke-width': w }, grp));
  if (stripe) {
    el('path', { d, stroke: stripe, 'stroke-width': 1.6 }, grp);
    (l.extra || []).forEach(ex => el('path', { d: pathD(ex), stroke: stripe, 'stroke-width': 1.6 }, grp));
  }
  el('path', { d, class: 'hit', 'data-line': id }, g('gHit'));
  routeEls[id] = grp;
});
// enkelriktningspilar på Djurgårdsslingan
[[2620, 1012, 180], [2614, 1034, 45], [2687, 1040, -90]].forEach(([x, y, r]) =>
  el('path', { d: 'M-4,-3 L1,0 L-4,3', transform: `translate(${x},${y}) rotate(${r})`, class: 'oneway' }, g('gDeco')));

// Bytespunkter
PILLS.forEach(([ids, x1, y1, x2, y2, type]) => {
  const grp = el('g', { class: 'pill', 'data-st': ids.join(' ') }, g('gPills'));
  if (type === 'd') {
    el('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 5.5, 'stroke-linecap': 'round' }, grp);
    el('line', { x1, y1, x2, y2, stroke: '#c6c8ca', 'stroke-width': 3, 'stroke-linecap': 'round' }, grp);
    [[x1, y1], [x2, y2]].forEach(([cx, cy]) => el('circle', { cx, cy, r: 6.2, fill: '#c6c8ca', stroke: '#fff', 'stroke-width': 1.6 }, grp));
  } else {
    el('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 17, 'stroke-linecap': 'round' }, grp);
    el('line', { x1, y1, x2, y2, stroke: '#c6c8ca', 'stroke-width': 14, 'stroke-linecap': 'round' }, grp);
  }
  el('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 22, 'stroke-linecap': 'round', 'data-st': ids[0] }, grp);
  ids.forEach(s => (stationEls[s] = stationEls[s] || []).push(grp));
});

// Stationspunkter och etiketter
const ROT = 45, LH = 17;
function label(st) {
  let L = st.lab;
  if (!L) return;
  if (typeof L === 'string') L = { d: L };
  const d = L.d, text = L.t || st.name;
  const ax = L.x ?? st.x, ay = L.y ?? st.y, custom = L.x != null;
  const off = custom ? 0 : 13, dg = custom ? 0 : 7;
  const P = {
    e: [ax + off, ay, 'start', 0], w: [ax - off, ay, 'end', 0],
    n: [ax, ay - off - 2, 'middle', 0], s: [ax, ay + off + 12, 'middle', 0],
    ne: [ax + dg, ay - dg, 'start', -ROT],
    sw: [ax - dg, ay + dg, 'end', -ROT],
    se: [ax + 6, ay + 6, 'start', ROT], nw: [ax - 6, ay - 6, 'end', ROT],
  }[d];
  const t = el('text', { x: P[0], y: P[1], 'text-anchor': P[2], class: 'lbl', 'data-st': st.id }, g('gLabels'));
  if (P[3]) t.setAttribute('transform', `rotate(${P[3]} ${P[0]} ${P[1]})`);
  const lines = text.split('\n');
  const y0 = -(lines.length - 1) * LH / 2;
  lines.forEach((s, i) => {
    // em-enheter så att radavståndet följer med när textstorleken ändras vid zoom
    const sp = el('tspan', { x: P[0], dy: ((i === 0 ? y0 + 4.5 : LH) / 17).toFixed(3) + 'em' }, t);
    sp.textContent = s;
  });
  (stationEls[st.id] = stationEls[st.id] || []).push(t);
}
for (const id in ST) {
  const st = ST[id];
  if (!st.lines.size) { console.warn('Station utan linje', id); continue; }
  if (!PILL_OF[id]) {
    const c = el('circle', { cx: st.x, cy: st.y, r: 3.6, class: 'dot', 'data-st': id }, g('gStations'));
    (stationEls[id] = stationEls[id] || []).push(c);
  }
  label(st);
}

// Ikoner och brickor
function icon(x, y, kind, parent) {
  const grp = el('g', { transform: `translate(${x},${y})`, class: 'icon' }, parent);
  el('rect', { x: -13, y: -13, width: 26, height: 26, rx: 2.5, fill: kind === 'info' ? '#9ddcf9' : '#9ddcf9' }, grp);
  if (kind === 'metro') {
    el('circle', { r: 9.5, fill: 'none', stroke: '#000', 'stroke-width': 1.8 }, grp);
    el('path', { d: 'M-6,-5.5H6V-2.2H1.8V7H-1.8V-2.2H-6Z', fill: '#000' }, grp);
  } else if (kind === 'train') {
    el('path', { d: 'M-6,-9H6Q8,-9 8,-7V4Q8,6 6,6H-6Q-8,6 -8,4V-7Q-8,-9 -6,-9Z', fill: '#000' }, grp);
    el('rect', { x: -5.5, y: -6.5, width: 11, height: 5.5, rx: 1, fill: '#9ddcf9' }, grp);
    el('circle', { cx: -4, cy: 2.5, r: 1.4, fill: '#9ddcf9' }, grp);
    el('circle', { cx: 4, cy: 2.5, r: 1.4, fill: '#9ddcf9' }, grp);
    el('path', { d: 'M-5,7L-8,11M5,7L8,11', stroke: '#000', 'stroke-width': 1.8 }, grp);
  } else if (kind === 'plane') {
    el('path', { d: 'M9,-9L-1,-5L-8,-8L-10,-6L-4,-2L-7,3L-10,3L-11,5L-6,6L-4,10L-2,9L-2,5L2,1L6,8L8,6L5,-2L9,-9Z', fill: '#000' }, grp);
  } else if (kind === 'info') {
    el('rect', { x: -2.2, y: -3, width: 4.4, height: 11, fill: '#000' }, grp);
    el('circle', { cy: -7.5, r: 2.6, fill: '#000' }, grp);
  }
  return grp;
}
function badge(x, y, lineId, parent) {
  const l = LINE[lineId], c = colorOf(l);
  const grp = el('g', { transform: `translate(${x},${y})`, class: 'badge', 'data-line': lineId }, parent);
  const w = 40, h = 26;
  const rx = l.mode === 'pendel' ? 13 : l.mode === 'metro' ? 3 : 9;
  el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx, fill: c }, grp);
  const t = el('text', { y: 7.5, class: 'btxt' }, grp);
  t.textContent = lineId;
  return grp;
}
const fitText = [];
for (const id in TERMINI) {
  const grp = el('g', { class: 'term', 'data-st': id }, g('gDeco'));
  TERMINI[id].forEach(it => {
    if (it[0] === 'i') icon(it[1], it[2], it[3], grp);
    else if (it[0] === 'b') badge(it[1], it[2], it[3], grp);
    else {
      const t = el('text', { x: it[1], y: it[2] + 7.5, class: 'tlbl', 'text-anchor': it[4] || 'start', 'data-st': id }, grp);
      t.textContent = it[3];
      if (it[5]) fitText.push([t, it[5]]);
    }
  });
  (stationEls[id] = stationEls[id] || []).push(grp);
  decoEls[id] = grp;
  shiftTerminus(id, grp);
}
/* Ändstation: linjen slutar i en vanlig stationsprick och brickan/namnet flyttas ut
   längs linjens riktning så att pricken syns. Gäller bara stationer där alla linjer vänder. */
function shiftTerminus(id, grp) {
  if (PILL_OF[id]) return;
  const st = ST[id], dirs = [];
  for (const lid of st.lines) {
    const l = LINE[lid], i = l.stops.indexOf(id);
    if (i !== 0 && i !== l.stops.length - 1) return;           // linjen går förbi – inte ändstation
    const k = l.route.stopIdx[i], P = l.route.pts[i === 0 ? k + 1 : k - 1], Q = l.route.pts[k];
    const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]) || 1;
    dirs.push([(Q[0] - P[0]) / L, (Q[1] - P[1]) / L]);
  }
  if (!dirs.length) return;
  let ux = dirs.reduce((s, d) => s + d[0], 0), uy = dirs.reduce((s, d) => s + d[1], 0);
  const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  // Hur långt bakom pricken ligger närmaste bricka/ikon i linjens riktning?
  let need = 0;
  TERMINI[id].forEach(it => {
    if (it[0] === 't') return;
    const hw = it[0] === 'b' ? 20 : 13, hh = 13;
    const proj = (it[1] - st.x) * ux + (it[2] - st.y) * uy;
    const ext = hw * Math.abs(ux) + hh * Math.abs(uy);
    // bara föremål som ligger i linjens förlängning (inte bredvid)
    const side = Math.abs(-(it[1] - st.x) * uy + (it[2] - st.y) * ux);
    if (side < ext + 8) need = Math.max(need, 14 - (proj - ext));
  });
  if (need <= 0) return;
  const dx = ux * need, dy = uy * need;
  grp.setAttribute('transform', `translate(${dx.toFixed(1)},${dy.toFixed(1)})`);
  grp.dataset.dx = dx; grp.dataset.dy = dy;
}

/* ---------- Etiketter ----------
   Vid kraftig utzoomning släcks stationsnamnen; ändstationernas namn (gDeco) ligger kvar. */
const LOD_K = 0.4;
function scheduleLabels() { svg.classList.toggle('lod', view.k < LOD_K); }

/* ---------- Mobil ---------- */
const GRAB = '<div class="grab" aria-hidden="true"></div>';
const isMobile = () => svg.clientWidth < 760;
// Punkten på skärmen där fokus ska hamna: mitt i den del av kartan som inte täcks av panelen
function viewCenter() {
  const W = svg.clientWidth, H = svg.clientHeight, info = $('#info');
  const open = info.classList.contains('show');
  if (isMobile()) return [W / 2, open ? (H - info.offsetHeight) / 2 : H / 2];
  return [open ? (W - 330) / 2 : W / 2, H / 2];
}

/* ---------- Zoom & panorering ---------- */
const view = { k: 1, tx: 0, ty: 0 };
const K_MIN = 0.15, K_MAX = 6;
function applyView() {
  vp.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.k})`);
  scheduleLabels();
  if (ME.map) drawMe();
  drawVehicles();
}
function zoomAt(mx, my, f) {
  const k = Math.min(K_MAX, Math.max(K_MIN, view.k * f)), r = k / view.k;
  view.tx = mx - (mx - view.tx) * r; view.ty = my - (my - view.ty) * r; view.k = k;
  applyView();
}
function fitTarget(x0, y0, x1, y1, pad = 30) {
  const W = svg.clientWidth, H = svg.clientHeight;
  const rp = $('#info').classList.contains('show') && W >= 760 ? 330 : 0;
  const mob = W < 760, info = $('#info').classList.contains('show');
  const sheet = mob && info ? $('#info').offsetHeight : 0;
  const aw = W - pad * 2 - rp, ah = H - sheet - pad * 2 - (mob && !info ? 60 : 0);
  const oy = 0;
  const k = Math.min(K_MAX, Math.max(K_MIN, Math.min(aw / (x1 - x0), ah / (y1 - y0))));
  return { k, tx: pad + aw / 2 - (x0 + x1) / 2 * k, ty: oy + pad + ah / 2 - (y0 + y1) / 2 * k };
}
let anim = 0;
let animating = false;
function animateTo(t, ms = 500) {
  const s = { ...view }, t0 = performance.now();
  animating = true;
  cancelAnimationFrame(anim);
  const W = svg.clientWidth / 2, H = svg.clientHeight / 2;
  const cs = [(W - s.tx) / s.k, (H - s.ty) / s.k], ct = [(W - t.tx) / t.k, (H - t.ty) / t.k];
  const step = now => {
    const u = Math.min(1, (now - t0) / ms), e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const k = Math.exp(Math.log(s.k) + (Math.log(t.k) - Math.log(s.k)) * e);
    view.k = k;
    view.tx = W - (cs[0] + (ct[0] - cs[0]) * e) * k;
    view.ty = H - (cs[1] + (ct[1] - cs[1]) * e) * k;
    applyView();
    if (u < 1) anim = requestAnimationFrame(step); else animating = false;
  };
  anim = requestAnimationFrame(step);
}
function startView() {
  if (!isMobile()) return fitAll(false);
  const W = svg.clientWidth, H = svg.clientHeight, k = Math.min(W / 820, H / 1750);
  Object.assign(view, { k, tx: W / 2 - 1745 * k, ty: H / 2 - 1090 * k });
  applyView();
}
const fitAll = a => { const t = fitTarget(590, 60, W0 - 40, H0 - 50, 10); a ? animateTo(t) : (Object.assign(view, t), applyView()); };
function fitStations(ids) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  ids.forEach(id => { const s = ST[id]; x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); });
  animateTo(fitTarget(x0 - 90, y0 - 70, x1 + 160, y1 + 70));
}

const pointers = new Map();
let moved = 0, pinch = null;
svg.addEventListener('pointerdown', e => {
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0; cancelAnimationFrame(anim); animating = false;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; }
  svg.classList.add('dragging');
});
svg.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    view.tx += dx; view.ty += dy; moved += Math.abs(dx) + Math.abs(dy); applyView();
    if (moved > 6 && follow) setFollow(false);
  }
  else if (pinch) {
    const [a, b] = [...pointers.values()];
    view.tx += dx / 2; view.ty += dy / 2;
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / view.k);
    moved += 10;
  }
});
let lastTap = { t: 0, x: 0, y: 0 };
svg.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch' || moved > 6 || pointers.size > 1) return;
  const now = performance.now();
  if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { zoomAt(e.clientX, e.clientY, 2); lastTap.t = 0; }
  else lastTap = { t: now, x: e.clientX, y: e.clientY };
});
const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(e.clientX, e.clientY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
}, { passive: false });
svg.addEventListener('dblclick', e => zoomAt(e.clientX, e.clientY, 2));
$('#zin').onclick = () => zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1.6);
$('#zout').onclick = () => zoomAt(svg.clientWidth / 2, svg.clientHeight / 2, 1 / 1.6);
$('#zfit').onclick = () => fitAll(true);
addEventListener('resize', applyView);

/* ---------- Markering ---------- */
let sel = null, focus = null, selSet = new Set(), stPanel = null, stFilter = null;
let selVeh = null, follow = false;
function clearSel() {
  sel = null; selSet = new Set(); stPanel = null; stFilter = null; stDir = 0;
  selVeh = null; follow = false;
  document.querySelectorAll('.veh.vsel').forEach(e => e.classList.remove('vsel'));
  svg.classList.remove('has-sel');
  document.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));
  setFocus(null);
  $('#info').classList.remove('show');
  renderAlertMarkers();
}
function setFocus(id) {
  document.querySelectorAll('.focus').forEach(e => e.classList.remove('focus'));
  focus = id;
  if (id) (stationEls[id] || []).forEach(e => e.classList.add('focus'));
}
/* Markera en eller flera linjer – övriga tonas ner och deras fordon döljs */
function selectLines(ids, { zoom = true, info = true } = {}) {
  ids = ids.filter(id => LINE[id]);
  if (!ids.length) return;
  clearSel();
  selSet = new Set(ids);
  sel = ids.length === 1 ? ids[0] : null;
  svg.classList.add('has-sel');
  ids.forEach(id => {
    routeEls[id].classList.add('sel');
    routeEls[id].parentNode.appendChild(routeEls[id]);
    LINE[id].stops.forEach(s => (stationEls[s] || []).forEach(e => e.classList.add('sel')));
    document.querySelectorAll(`.badge[data-line="${id}"]`).forEach(e => e.classList.add('sel'));
  });
  vehEls.forEach((el, vid) => el.classList.toggle('sel', selSet.has(vehicles.get(vid).line)));
  if (info && sel) showLineInfo(LINE[sel]);
  renderAlertMarkers();
  if (zoom) fitStations([...new Set(ids.flatMap(id => LINE[id].stops))]);
}
const selectLine = (id, zoom = true) => selectLines([id], { zoom });
function chip(l, at) {
  const rx = l.mode === 'pendel' ? 13 : l.mode === 'metro' ? 3 : 8;
  return `<button class="chip" data-line="${l.id}"${at ? ` data-at="${at}"` : ''} style="background:${colorOf(l)};border-radius:${rx}px">${l.id}</button>`;
}
/* Linjevy: stationer längs ett spår, med linjens fordon utplacerade mellan stationerna.
   Fordon mot linjens slut (nedåt i listan) till höger om spåret, mot början till vänster. */
function showLineInfo(l, at) {
  const info = $('#info');
  info.style.setProperty('--c', colorOf(l));
  const others = at ? [...ST[at].lines].filter(i => i !== l.id).map(i => LINE[i]).sort((a, b) => a.id - b.id) : [];
  const first = ST[l.stops[0]].name, last = ST[l.stops[l.stops.length - 1]].name;
  info.innerHTML = `${GRAB}<div class="hd"><button class="close" aria-label="Stäng">×</button>
    <h2>${chip(l)}<span>${l.name.replace(/\s\d+$/, '')}</span></h2>
    <div class="sub">${l.desc} · ${l.stops.length} stationer · <span class="vcount"></span></div></div>
    ${others.length ? `<div class="also"><span>Fler linjer vid ${ST[at].name}:</span><div class="chips">${others.map(o => chip(o, at)).join('')}</div></div>` : ''}
    ${alertList(alertsForLine(l.id))}
    <div class="lv-head"><span>▲ mot ${first}</span><span>▼ mot ${last}</span></div>
    <div class="lv" data-line="${l.id}">
      <div class="lv-track"></div>
      <ol class="lv-stops">${l.stops.map(s => `<li data-st="${s}"${s === at ? ' class="cur"' : ''}><span>${ST[s].name}</span></li>`).join('')}</ol>
      <div class="lv-veh"></div>
    </div>`;
  info.classList.add('show');
  updateLineVehicles();
  const cur = info.querySelector('li.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
}
const lvDir = new Map();   // senast kända riktning per fordon
function updateLineVehicles() {
  const box = $('#info .lv');
  if (!box) return;
  const l = LINE[box.dataset.line], layer = box.querySelector('.lv-veh');
  const rh = box.querySelector('.lv-stops li')?.offsetHeight || 28;
  const seen = new Set();
  vehicles.forEach((V, id) => {
    if (V.line !== l.id) return;
    const i = l.stops.indexOf(V.from);
    if (i < 0) return;
    const j = V.to != null ? l.stops.indexOf(V.to) : -1;
    if (V.to != null && j < 0) return;
    let dir = j >= 0 && j !== i ? Math.sign(j - i) : lvDir.get(id) || 1;
    lvDir.set(id, dir);
    const pos = j >= 0 ? i + (j - i) * (V.progress || 0) : i;
    let m = layer.querySelector(`[data-vid="${CSS.escape(id)}"]`);
    if (!m) {
      m = document.createElement('button');
      m.className = 'vm';
      m.dataset.vid = id;
      layer.appendChild(m);
    }
    m.classList.toggle('up', dir < 0);
    m.classList.toggle('vsel', id === selVeh);
    m.textContent = dir < 0 ? '▲' : '▼';
    m.style.top = (pos * rh + rh / 2) + 'px';
    const lv = live.veh.get(id);
    m.title = lv ? `${l.name} mot ${ST[lv.to].name} · ${fmtDelay(lv.delay)}` : `${l.name} mot ${ST[dir > 0 ? l.stops[l.stops.length - 1] : l.stops[0]].name}`;
    seen.add(id);
  });
  layer.querySelectorAll('.vm').forEach(m => seen.has(m.dataset.vid) || m.remove());
  const c = $('#info .vcount');
  if (c) c.textContent = `${seen.size} fordon i trafik`;
}
setInterval(updateLineVehicles, 250);
// Stationer som hör ihop via en bytespunkt
const GROUP = {};
PILLS.forEach(([ids]) => { const all = new Set(ids.flatMap(i => GROUP[i] || [i])); all.forEach(i => GROUP[i] = [...all]); });
const groupOf = id => GROUP[id] || [id];
// Världskoordinat från skärmpunkt
const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - view.tx) / view.k, (cy - r.top - view.ty) / view.k]; };
// Linjen (bland stationens linjer) vars geometri ligger närmast punkten
function nearestLine(id, wx, wy) {
  const ids = [...ST[id].lines];
  if (wx == null) return ids.sort((a, b) => a - b)[0];
  let best = ids[0], bd = Infinity;
  ids.forEach(lid => LINE[lid].route.pts.forEach(([x, y]) => {
    const d = (x - wx) ** 2 + (y - wy) ** 2;
    if (d < bd) { bd = d; best = lid; }
  }));
  return best;
}
/* Fokusera en station: markera en linje som trafikerar den, tona ner resten, zooma in.
   opts.line = önskad linje, opts.at = [wx, wy] klickpunkt för att välja närmaste linje */
/* Station: alla linjer som stannar där (inkl. bytespunktens andra noder) markeras.
   opts.line = visa bara den linjen (används från linjelistan och linjeknapparna). */
function showStation(id, opts = {}) {
  const s = ST[id];
  if (!s || !s.lines.size) return;
  const keep = opts.line ? opts.line : opts.fromList && sel && s.lines.has(sel) ? sel : null;
  if (keep) {
    if (sel !== keep) selectLine(keep, false);
    showLineInfo(LINE[keep], id);
  } else {
    selectLines(stationLines(id), { zoom: false, info: false });
    stPanel = id;
    renderStationPanel();
  }
  setFocus(id);
  if (opts.zoom !== false) zoomToStation(id);
}
const stationLines = id => [...new Set(groupOf(id).flatMap(g => [...ST[g].lines]))].sort((a, b) => a - b);
/* Linjeknapparna i avgångsvyn filtrerar avgångarna (och kartan) i stället för att byta vy */
function setStationFilter(lineId) {
  const id = stPanel;
  const f = stFilter === lineId ? null : lineId;
  const d = stDir;
  selectLines(f ? [f] : stationLines(id), { zoom: false, info: false });
  stPanel = id; stFilter = f; stDir = d;
  setFocus(id);
  renderStationPanel();
}
function filterChip(l) {
  const rx = l.mode === 'pendel' ? 13 : l.mode === 'metro' ? 3 : 8;
  const cls = stFilter === l.id ? ' on' : stFilter ? ' dim' : '';
  return `<button class="chip${cls}" data-filter="${l.id}" style="background:${colorOf(l)};border-radius:${rx}px">${l.id}</button>`;
}
/* Riktning för ett tåg vid stationen: 1 = mot linjens slut (nedåt i linjelistan), 2 = mot början */
function rowDir(v, i) {
  const l = LINE[v.draw || v.line], si = l.stops.indexOf(v.stops[i]);
  const ti = l.stops.indexOf(v.to);
  if (ti >= 0 && si >= 0 && ti !== si) return ti > si ? 1 : 2;
  const pi = i > 0 ? l.stops.indexOf(v.stops[i - 1]) : -1;      // slutstation: kom från vilket håll?
  return pi >= 0 && pi < si ? 1 : 2;
}
let stDir = 0;
const DIR_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 8h13m0 0-4-4m4 4-4 4M20 16H7m0 0 4-4m-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderStationPanel() {
  const id = stPanel, s = ST[id], info = $('#info');
  const grp = groupOf(id);
  const lines = stationLines(id).map(i => LINE[i]);
  const names = [...new Set(grp.map(g => ST[g].name))].join(' / ');
  let dep = '', dirBtn = '';
  if (mode === 'live' && live.data) {
    const now = Date.now() / 1000 + live.skew, all = [];
    live.veh.forEach(v => {
      const p = v.pos; if (!p) return;
      if (stFilter && v.line !== stFilter) return;
      const next = p.at >= 0 ? p.at : p.seg + 1;
      for (let i = next; i < v.stops.length; i++) {
        if (!grp.includes(v.stops[i])) continue;
        const last = i === v.stops.length - 1;
        const t = (i === 0 ? v.dep[0] : v.arr[i]) + v.delay;
        if (t < now - 60) break;
        all.push({ v, t, last, here: p.at === i, dir: rowDir(v, i) });
        break;
      }
    });
    // Turer i tidtabellen som inte syns som fordon än (ej startade eller utan position)
    if (SCHED.data) {
      const shown = new Set([...live.veh.values()].map(v => v.trip));
      const { patterns, timings, trips } = SCHED.data;
      for (const [tid, line, draw, p, ti, start] of trips) {
        if (start > now + 3600) break;
        if (start < now - 60 || shown.has(tid) || (stFilter && line !== stFilter)) continue;
        const stops = patterns[p], tm = timings[ti];
        const i = stops.findIndex(s => grp.includes(s));
        if (i < 0) continue;
        const t = start + (i === 0 ? tm[1] : tm[2 * i]);
        if (t < now - 60 || t > now + 3600) continue;
        const pv = { id: null, trip: tid, line, draw, stops, to: stops[stops.length - 1], delay: 0 };
        all.push({ v: pv, t, last: i === stops.length - 1, here: false, dir: rowDir(pv, i), planned: true });
      }
    }
    // Riktningsknapp: Alla → Riktning 1 → Riktning 2
    const dest = d => [...new Set(all.filter(r => r.dir === d).map(r => ST[r.last ? r.v.stops[r.v.stops.length - 1] : r.v.to].name))];
    const lbl = stDir ? (dest(stDir).length ? 'Mot ' + dest(stDir).slice(0, 3).join(', ') + (dest(stDir).length > 3 ? ' …' : '') : `Riktning ${stDir}`) : 'Alla riktningar';
    dirBtn = `<button class="dirbtn${stDir ? ' on' : ''}" data-dir="1" title="Växla riktning (alla / riktning 1 / riktning 2)">${DIR_ICON}<span>${lbl}</span></button>`;
    const rows = all.filter(r => !stDir || r.dir === stDir).sort((a, b) => a.t - b.t);
    const age = now - (live.data.updated || 0);
    const ago = age > 5400 ? Math.round(age / 3600) + ' h' : Math.round(age / 60) + ' min';
    const note = live.fleet === 'sched'
      ? `<div class="stale">Visar tidtabell${age < 3600 ? ' med senaste förseningar' : ''} – realtid senast kl ${live.data.updated ? hhmm(live.data.updated) + ` (${ago} sedan)` : 'saknas'}.</div>`
      : age > 15 * 60 ? `<div class="stale">Realtidsdata från kl ${hhmm(live.data.updated)} (${ago} sedan).</div>` : '';
    dep = rows.length ? `<div class="branch">Nästa tåg</div>${note}<ol class="deps">${rows.slice(0, 14).map(r => {
      const l = LINE[r.v.line], m = Math.round((r.t - now) / 60);
      const rel = r.here ? 'här nu' : m <= 0 ? 'nu' : `${m} min`;
      const late = Math.abs(r.v.delay) >= 60 ? ` <span class="${r.v.delay >= 120 ? 'bad' : 'muted'}">${fmtDelay(r.v.delay)}</span>` : '';
      const tag = r.planned || (r.v.sched && !r.v.delayKnown) ? ' <span class="muted">tidtabell</span>' : '';
      return `<li${r.v.id ? ` data-vid="${r.v.id}"` : ' class="planned"'}><span class="tm">${hhmm(r.t)}</span>${chip(l)}<span class="nm">${r.last ? 'Slutstation' : ST[r.v.to].name}${late}${tag}</span><span class="rel">${rel}</span></li>`;
    }).join('')}</ol>` : (note || `<div class="sub" style="margin-top:14px">Inga tåg${stFilter ? ` på linje ${stFilter}` : ''}${stDir ? ' i den riktningen' : ''} på väg hit just nu.</div>`);
  }
  const scroll = info.scrollTop;
  info.style.removeProperty('--c');
  info.innerHTML = `${GRAB}<div class="hd"><button class="close" aria-label="Stäng">×</button><h2><span>${names}</span></h2>
    <div class="sub">${lines.length > 1 ? (stFilter ? `Visar linje ${stFilter} – klicka igen för alla` : `${lines.length} linjer – välj en för att filtrera`) : '1 linje'}</div>
    <div class="chips filter">${lines.map(filterChip).join('')}</div>${dirBtn}</div>${alertList(alertsForStation(id))}${dep}`;
  info.classList.add('show');
  info.scrollTop = scroll;
}
setInterval(() => stPanel && !selVeh && renderStationPanel(), 2000);
svg.addEventListener('click', e => {
  if (moved > 5) return;
  // pointer capture gör att click riktas mot svg-elementet – slå upp verkligt mål
  const hitEl = document.elementFromPoint(e.clientX, e.clientY) || e.target;
  const t = hitEl.closest && hitEl.closest('[data-line],[data-st],.veh');
  if (!t) return clearSel();
  if (t.classList.contains('veh')) return showVehicle(t.dataset.vid);
  const w = toWorld(e.clientX, e.clientY);
  if (t.dataset.st) {
    // bytespunkter kan omfatta flera stationer – ta den närmaste
    const id = t.dataset.st.split(' ').sort((a, b) =>
      ((ST[a].x - w[0]) ** 2 + (ST[a].y - w[1]) ** 2) - ((ST[b].x - w[0]) ** 2 + (ST[b].y - w[1]) ** 2))[0];
    return showStation(id, { at: w });
  }
  if (t.dataset.line) return t.closest('#gLegend') ? (sel === t.dataset.line ? clearSel() : selectLine(t.dataset.line)) : selectLine(t.dataset.line, false);
});
$('#info').addEventListener('click', e => {
  const al = e.target.closest('.alert');
  if (al) { al.classList.toggle('open'); openAlerts[al.dataset.aid] = al.classList.contains('open'); return; }
  const t = e.target.closest('[data-st],[data-line],[data-zoom],[data-vid],[data-filter],[data-dir],.close,.follow');
  if (!t) return;
  if (t.classList.contains('close')) return clearSel();
  if (t.classList.contains('follow')) return setFollow(!follow);
  if (t.dataset.zoom) { setFollow(false); return zoomToStation(t.dataset.zoom); }
  if (t.dataset.at) return showStation(t.dataset.at, { line: t.dataset.line });
  if (t.dataset.dir) { stDir = (stDir + 1) % 3; return renderStationPanel(); }
  if (t.dataset.filter) return setStationFilter(t.dataset.filter);
  if (t.dataset.vid) return showVehicle(t.dataset.vid);
  if (t.dataset.st) return showStation(t.dataset.st, { fromList: true });
  if (t.dataset.line) return selectLine(t.dataset.line);
});
addEventListener('keydown', e => { if (e.key === 'Escape') clearSel(); });
(function sheet() {
  const info = $('#info');
  let drag = null;
  const setH = h => info.style.setProperty('--sheet', Math.round(h) + 'px');
  info.addEventListener('pointerdown', e => {
    if (!isMobile() || !e.target.closest('.grab,.hd') || e.target.closest('button')) return;
    drag = { y: e.clientY, h: info.offsetHeight, moved: 0, id: e.pointerId };
    info.setPointerCapture(e.pointerId);
    info.classList.add('dragging');
  });
  info.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dy));
    setH(Math.max(80, Math.min(innerHeight * 0.92, drag.h - dy)));
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    info.classList.remove('dragging');
    const H = innerHeight, h = info.offsetHeight;
    if (drag.moved < 6) setH(drag.h < H * 0.6 ? H * 0.88 : H * 0.45);   // tryck: växla
    else if (h < H * 0.25) { info.style.removeProperty('--sheet'); clearSel(); }
    else setH(h < H * 0.66 ? H * 0.45 : H * 0.88);
    drag = null;
  };
  info.addEventListener('pointerup', end);
  info.addEventListener('pointercancel', end);
})();

// Sök
const byName = {};
Object.values(ST).forEach(s => { if (s.lines.size) (byName[s.name.toLowerCase()] ||= s.id); });
if ($('#stationList')) $('#stationList').innerHTML = Object.keys(byName).map(k => ST[byName[k]].name).sort((a, b) => a.localeCompare(b, 'sv'))
  .map(n => `<option value="${n}">`).join('');
$('#search')?.addEventListener('change', e => {
  const id = byName[e.target.value.trim().toLowerCase()];
  if (!id) return;
  showStation(id); e.target.blur();
});

/* =========================================================================
   FORDON – API för realtid
   TrackMap.setVehicles([{ id, line, from, to, progress, label? }])
     line     linje-id ('14')
     from/to  stations-id för föregående och nästa stopp (ordningen = färdriktning)
     progress 0..1 mellan stoppen
   Positioner tweenas mjukt till nya värden; anropet stänger av demoläget.
   TrackMap.stationIdByName('Slussen') → 'slu'
   ========================================================================= */
const vehicles = new Map(), vehEls = new Map();
function pointOnLine(lineId, from, to, progress) {
  const l = LINE[lineId];
  if (!l) return null;
  const { stops, route } = l;
  const i = stops.indexOf(from), j = to == null ? -1 : stops.indexOf(to);
  if (i < 0) return null;
  if (j < 0 || j === i) {
    const p = route.pts[route.stopIdx[i]];
    const n = route.pts[Math.min(route.stopIdx[i] + 1, route.pts.length - 1)], q = route.pts[Math.max(route.stopIdx[i] - 1, 0)];
    return { x: p[0], y: p[1], a: Math.atan2(n[1] - q[1], n[0] - q[0]) };
  }
  const p = Math.max(0, Math.min(1, progress || 0));
  const A = route.cum[route.stopIdx[i]], B = route.cum[route.stopIdx[j]];
  const target = A + (B - A) * p, fwd = B > A;
  let k = 0;
  while (k < route.pts.length - 2 && route.cum[k + 1] < target) k++;
  const P = route.pts[k], Q = route.pts[k + 1], L = route.cum[k + 1] - route.cum[k] || 1, u = (target - route.cum[k]) / L;
  return { x: P[0] + (Q[0] - P[0]) * u, y: P[1] + (Q[1] - P[1]) * u, a: Math.atan2(Q[1] - P[1], Q[0] - P[0]) + (fwd ? 0 : Math.PI) };
}
function upsertVehicle(v, tween = true) {
  const pos = pointOnLine(v.draw || v.line, v.from, v.to, v.progress);
  if (!pos) return;
  let cur = vehicles.get(v.id);
  if (!cur) {
    cur = { ...v, cur: pos, tgt: pos, t0: 0 };
    vehicles.set(v.id, cur);
    const l = LINE[v.line], c = colorOf(l);
    const ge = el('g', { class: 'veh', 'data-vid': v.id }, g('gVehicles'));
    el('path', { d: 'M-5.5,-1 L5.5,-1 L0,8.5Z', class: 'arrow', fill: '#fff' }, ge);
    el('circle', { r: 12, fill: 'transparent', class: 'vhit' }, ge);
    el('circle', { r: 8, fill: c, stroke: '#fff', 'stroke-width': 2, class: 'vbody' }, ge);
    el('text', { y: 3.3 }, ge).textContent = v.label ?? l.id;
    el('title', {}, ge).textContent = v.title || `${l.name} mot ${ST[v.to]?.name || ''}`;
    vehEls.set(v.id, ge);
    if (selSet.size) ge.classList.toggle('sel', selSet.has(v.line));
    if (selVeh === v.id) ge.classList.add('vsel');
  } else {
    Object.assign(cur, v);
    if (tween) { cur.from0 = { ...cur.cur }; cur.t0 = performance.now(); } else if (!cur.t0) cur.cur = pos;
    vehEls.get(v.id).querySelector('title').textContent = v.title || `${LINE[v.line].name} mot ${ST[v.to]?.name || ''}`;
  }
  cur.tgt = pos;
}
const TINY_K = 0.7;    // under denna zoom: små prickar utan linjenummer och pil
function drawVehicles() {
  svg.classList.toggle('vtiny', view.k < TINY_K);
  const now = performance.now(), s = view.k < TINY_K ? Math.max(0.34, view.k) : Math.max(0.95, view.k * 0.8);   // följer linjebredden vid inzoomning (≈1,2 × linjen)
  vehicles.forEach((v, id) => {
    if (v.t0) {
      const u = Math.min(1, (now - v.t0) / 1200);
      v.cur = { x: v.from0.x + (v.tgt.x - v.from0.x) * u, y: v.from0.y + (v.tgt.y - v.from0.y) * u };
      if (u >= 1) v.t0 = 0;
    }
    const ge = vehEls.get(id);
    ge.setAttribute('transform', `translate(${(v.cur.x * view.k + view.tx).toFixed(1)},${(v.cur.y * view.k + view.ty).toFixed(1)}) scale(${s.toFixed(2)})`);
    ge.firstChild.setAttribute('transform', `rotate(${(v.tgt.a * 180 / Math.PI - 90).toFixed(0)}) translate(0,6)`);
  });
}
function removeVehicle(id) { vehEls.get(id)?.remove(); vehEls.delete(id); vehicles.delete(id); }
function setVehicles(list, { replace = true } = {}) {
  setMode('api');
  const seen = new Set();
  list.forEach(v => { upsertVehicle(v); seen.add(v.id); });
  if (replace) [...vehicles.keys()].forEach(id => seen.has(id) || removeVehicle(id));
  kick();
}

/* Demosimulering */
let demo = null;
function startDemo() {
  stopDemo();
  demo = [];
  LINES.forEach(l => {
    const n = l.stops.length, count = Math.max(2, Math.round(n / 4));
    for (let i = 0; i < count; i++)
      demo.push({ id: `demo-${l.id}-${i}`, line: l.id, seg: Math.floor(i / count * (n - 1)), dir: i % 2 ? -1 : 1, p: Math.random(), dwell: 0 });
  });
  kick();
}
function stopDemo() {
  if (!demo) return;
  demo.forEach(d => removeVehicle(d.id));
  demo = null;
}
function stepDemo(dt) {
  const sp = DEMO_SPEED;
  demo.forEach(d => {
    const { route, stops } = LINE[d.line];
    if (d.dwell > 0) d.dwell -= dt;
    else {
      const len = route.cum[route.stopIdx[d.seg + 1]] - route.cum[route.stopIdx[d.seg]];
      d.p += sp * 22 * dt / Math.max(len, 1);
      if (d.p >= 1) {
        d.p = 0; d.dwell = 1 / sp;
        d.seg += d.dir;
        if (d.seg > stops.length - 2) { d.seg = stops.length - 2; d.dir = -1; }
        if (d.seg < 0) { d.seg = 0; d.dir = 1; }
      }
    }
    const [from, to] = d.dir > 0 ? [stops[d.seg], stops[d.seg + 1]] : [stops[d.seg + 1], stops[d.seg]];
    upsertVehicle({ id: d.id, line: d.line, from, to, progress: d.p }, false);
  });
}
let last = 0, looping = false;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (demo) stepDemo(dt);
  if (mode === 'live') stepLive();
  drawVehicles();
  if (demo || mode === 'live' || [...vehicles.values()].some(v => v.t0)) requestAnimationFrame(loop); else looping = false;
}
function kick() { if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(loop); } }

/* =========================================================================
   LIVE – hämtar /api/vehicles från server.py
   Servern skickar per fordon: kvarvarande stopp med tidtabell (arr/dep, epoch),
   uppmätt andel f på första sträckan och förseningen. Mellan uppdateringarna
   rullar fordonet vidare enligt tidtabell + försening.
   ========================================================================= */
let mode = 'off';
const DEMO_SPEED = 1.5;
const live = { ok: false, tried: false, data: null, updated: 0, skew: 0, veh: new Map(), timer: 0 };
const LIVE_URL = 'api/vehicles';
let MAX_AHEAD = 3;            // rulla högst så många stopp förbi senaste mätningen
const FREEZE_AFTER = 240;       // sekunder utan ny mätning → stanna

function clearVehicles() { [...vehicles.keys()].forEach(removeVehicle); live.veh.clear(); }
function setMode(m) {
  if (m === mode) return;
  if (mode === 'demo') stopDemo();
  if (m !== 'api') clearVehicles();
  mode = m;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#veh')?.classList.toggle('demo', m === 'demo');
  if (m === 'demo') startDemo();
  if (m === 'live') { live.updated = 0; pollLive(); if (!SCHED.data) loadSchedule(); }
  if (m !== 'live') clearTimeout(live.timer);
  status();
  kick();
}
async function pollLive() {
  clearTimeout(live.timer);
  try {
    const r = await fetch(LIVE_URL + '?t=' + Math.floor(Date.now() / 10000), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    live.ok = true; live.tried = true;
    // Statisk fil (GitHub Pages) – klientens klocka gäller, och fordonen får rulla längre på tidtabellen
    live.static = !!j.static;
    live.skew = j.static ? 0 : j.now - Date.now() / 1000;
    if (j.static) MAX_AHEAD = 30;
    live.data = j;
    setAlerts(j.alerts);
    if (mode === 'live' && j.updated !== live.updated) { live.updated = j.updated; refreshFleet(true); }
  } catch (e) {
    live.tried = true;
    live.error = String(e);
    if (!live.ok && window.SNAPSHOT && mode === 'live') {
      // Ingen server – spela upp inbäddad ögonblicksbild som om det vore nu
      const j = window.SNAPSHOT;
      live.snapshot = true; live.ok = true; MAX_AHEAD = 30;
      live.skew = j.now - Date.now() / 1000;
      live.data = j; live.updated = j.updated;
      setAlerts(j.alerts);
      applyLive(j.vehicles);
      status();
      return;
    }
    if (!live.ok && mode === 'live') { setMode('demo'); }
  }
  status();
  if (mode === 'live' && !live.snapshot) live.timer = setTimeout(pollLive, 10000);
}
/* ---------- Tidtabell som reserv ----------
   api/schedule innehåller dygnets spårturer. När realtiden är äldre än FRESH visas tågen
   enligt tidtabell (med senast kända försening per tur) i stället för att stå still. */
const SCHED = { data: null };
const FRESH = 10 * 60;
async function loadSchedule() {
  try {
    const r = await fetch('api/schedule?t=' + Math.floor(Date.now() / 600000), { cache: 'no-store' });
    if (!r.ok) return;
    SCHED.data = await r.json();
    refreshFleet(true);
  } catch (e) {}
}
function scheduledFleet(now) {
  const d = SCHED.data, out = [];
  const rt = live.data && live.data.updated && now - live.data.updated < 3600 ? live.data.vehicles : [];
  const delays = new Map(rt.map(v => [v.trip, v.delay]));
  for (const [tid, line, draw, p, ti, start] of d.trips) {
    if (start > now + 60) break;
    const tm = d.timings[ti], stops = d.patterns[p];
    if (start + tm[tm.length - 2] + 60 < now) continue;
    const known = delays.has(tid), delay = known ? delays.get(tid) : 0;
    out.push({ id: 's' + tid, trip: tid, line, draw, stops, to: stops[stops.length - 1], k: 0, f: 0, delay, delayKnown: known,
      sched: true, ts: now, arr: stops.map((_, i) => start + tm[2 * i]), dep: stops.map((_, i) => start + tm[2 * i + 1]), plat: [] });
  }
  return out;
}
function refreshFleet(force) {
  if (mode !== 'live' || live.snapshot) return;
  const now = Date.now() / 1000 + live.skew;
  const fresh = live.data && live.data.updated && now - live.data.updated < FRESH;
  const want = fresh || !SCHED.data ? 'rt' : 'sched';
  if (!force && want === live.fleet && want === 'rt') return;
  live.fleet = want;
  applyLive(want === 'rt' ? (live.data?.vehicles || []) : scheduledFleet(now));
}
setInterval(() => refreshFleet(live.fleet === 'sched'), 15000);

function fmtDelay(s) {
  const m = Math.round(s / 60);
  return Math.abs(m) < 1 ? 'i tid' : (m > 0 ? `+${m} min` : `${m} min`);
}
function applyLive(list) {
  const seen = new Set();
  list.forEach(v => {
    if (!LINE[v.line] || !LINE[v.draw || v.line] || v.stops.length < 1) return;
    seen.add(v.id);
    v.title = `${LINE[v.line].name} mot ${ST[v.to]?.name || ''} · ${v.sched && !v.delayKnown ? 'enligt tidtabell' : fmtDelay(v.delay)}`;
    const p = livePos(v, Date.now() / 1000 + live.skew);
    if (!p) return;
    v.pos = p;
    live.veh.set(v.id, v);
    upsertVehicle({ id: v.id, line: v.line, draw: v.draw, title: v.title, ...p }, vehicles.has(v.id));
  });
  [...live.veh.keys()].forEach(id => { if (!seen.has(id)) { live.veh.delete(id); removeVehicle(id); } });
  if (selVeh) renderVehPanel();
  kick();
}
function livePos(v, now) {
  const n = v.stops.length, k0 = Math.min(v.k || 0, Math.max(0, n - 2));
  if (n === 1) return { from: v.stops[0], to: null, progress: 0, seg: 0, at: 0 };
  const t = (v.sched ? now : Math.min(now, v.ts + (live.snapshot || live.static ? 1800 : FREEZE_AFTER))) - v.delay;
  const ahead = v.sched ? 1e9 : MAX_AHEAD;
  for (let j = k0; j < n - 1 && j <= k0 + ahead; j++) {
    if (t < v.dep[j]) {
      if (j === k0 && v.f >= 0.02) return { from: v.stops[j], to: v.stops[j + 1], progress: v.f, seg: j, at: -1 };
      return { from: v.stops[j], to: v.stops[j + 1], progress: 0, seg: j, at: j };
    }
    if (t < v.arr[j + 1]) {
      let p = (t - v.dep[j]) / Math.max(1, v.arr[j + 1] - v.dep[j]);
      if (j === k0) p = Math.max(p, v.f);
      return { from: v.stops[j], to: v.stops[j + 1], progress: p, seg: j, at: p >= 0.999 ? j + 1 : -1 };
    }
  }
  const j = Math.min(n - 1, k0 + ahead + 1);
  return { from: v.stops[j - 1], to: v.stops[j], progress: 1, seg: j - 1, at: j };
}
function stepLive() {
  const now = Date.now() / 1000 + live.skew;
  live.veh.forEach(v => { const p = livePos(v, now); if (p) { v.pos = p; upsertVehicle({ id: v.id, line: v.line, draw: v.draw, title: v.title, ...p }, false); } });
  followStep();
}
/* ---------- Störningar (GTFS-RT ServiceAlerts via servern) ----------
   Kategorier kan slås av/på med knapparna uppe till vänster. Meddelanden knutna till
   stationer visas som markörer vid stationen; meddelanden för hela linjer vid linjebrickorna. */
const ACATS = {
  traffic: { name: 'Trafikstörningar', icon: 'warn', color: '#ff5a4f' },
  access: { name: 'Hiss & entréer', icon: 'lift', color: '#f5a623' },
  info: { name: 'Övrig info', icon: 'info', color: '#9aa4ad' },
};
let ALERTS = [], alertsKey = '';
const openAlerts = {};
const aOn = (() => { try { return new Set(JSON.parse(localStorage.getItem('sparkarta.alerts')) || ['traffic']); } catch (e) { return new Set(['traffic']); } })();
const saveAOn = () => { try { localStorage.setItem('sparkarta.alerts', JSON.stringify([...aOn])); } catch (e) {} };
const enabledAlerts = () => ALERTS.filter(x => aOn.has(x.cat));
const alertsForStation = id => { const g = groupOf(id); return enabledAlerts().filter(x => x.stations.some(s => g.includes(s)) || (x.at || []).some(s => g.includes(s))); };
const alertsForLine = lid => { const st = new Set(LINE[lid].stops); return enabledAlerts().filter(x => x.lines.includes(lid) || x.stations.some(s => st.has(s))); };
function setAlerts(list) {
  list = list || [];
  const key = list.map(x => x.id + x.cat).join('|');
  if (key === alertsKey) return;
  ALERTS = list; alertsKey = key;
  renderAlertToggles(); renderAlertMarkers();
  if (stPanel && !selVeh) renderStationPanel();
}
function alertIcon(cat, parent, x, y, n) {
  const c = ACATS[cat], grp = el('g', { transform: `translate(${x},${y})`, class: 'amark-i' }, parent);
  if (c.icon === 'warn') {
    el('path', { d: 'M0,-11 L11,8 L-11,8Z', fill: c.color, stroke: '#2b2f33', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, grp);
    el('path', { d: 'M-1.4,-4 H1.4 L0.9,3 H-0.9Z M0,4.4 a1.5,1.5 0 1 0 0.01,0', fill: '#fff' }, grp);
  } else if (c.icon === 'lift') {
    el('rect', { x: -9, y: -9, width: 18, height: 18, rx: 3, fill: c.color, stroke: '#2b2f33', 'stroke-width': 1.5 }, grp);
    el('path', { d: 'M-4.5,-1 L-2,-5 L0.5,-1Z M-4.5,1 L-2,5 L0.5,1Z M3.5,-5 V5', fill: '#2b2f33', stroke: '#2b2f33', 'stroke-width': 1.2 }, grp);
  } else {
    el('circle', { r: 9, fill: c.color, stroke: '#2b2f33', 'stroke-width': 1.5 }, grp);
    el('rect', { x: -1.3, y: -2, width: 2.6, height: 7, fill: '#2b2f33' }, grp);
    el('circle', { cy: -5, r: 1.6, fill: '#2b2f33' }, grp);
  }
  if (n > 1) {
    el('circle', { cx: 10, cy: -9, r: 6.5, fill: '#fff' }, grp);
    const t = el('text', { x: 10, y: -5.6, class: 'acount' }, grp); t.textContent = n;
  }
}
// Var en störning ska markeras: nämnda stationer, annars få stationer, annars mittenstationen
function alertAnchors(x) {
  if (x.stretch) {      // en markör mitt på den avstängda sträckan
    const [A, B] = x.stretch;
    const l = (x.lines.map(i => LINE[i]).filter(Boolean).concat(LINES)).find(l => l.stops.includes(A) && l.stops.includes(B));
    if (l) { const i = l.stops.indexOf(A), j = l.stops.indexOf(B); return [l.stops[Math.round((i + j) / 2)]]; }
  }
  if (x.at && x.at.length) return x.at.filter(s => ST[s]);
  if (x.stations.length <= 3) return x.stations;
  const line = LINES.find(l => x.stations.every(s => l.stops.includes(s))) || LINES.find(l => x.stations.some(s => l.stops.includes(s)));
  const ordered = line ? line.stops.filter(s => x.stations.includes(s)) : x.stations;
  return [ordered[Math.floor(ordered.length / 2)]];
}
// Linjen (och dess sträcka mellan två stationer) för en avstängd/ersatt delsträcka
function stretchPath(x) {
  const [A, B] = x.stretch;
  const l = (x.lines.map(i => LINE[i]).filter(Boolean).concat(LINES)).find(l => l.stops.includes(A) && l.stops.includes(B));
  if (!l) return null;
  let i = l.route.stopIdx[l.stops.indexOf(A)], j = l.route.stopIdx[l.stops.indexOf(B)];
  if (i > j) [i, j] = [j, i];
  return { line: l.id, pts: l.route.pts.slice(i, j + 1) };
}
function renderAlertMarkers() {
  const layer = $('#gAlerts');
  if (!layer) return;
  layer.innerHTML = '';
  const order = ['traffic', 'access', 'info'];
  const byStation = {}, lineOnly = {};
  enabledAlerts().forEach(x => {
    if (x.stretch) {
      const sp = stretchPath(x);
      if (sp) {
        const on = !selSet.size || selSet.has(sp.line) || x.lines.some(l => selSet.has(l));
        const d = 'M' + sp.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
        const g = el('g', { class: 'astretch' + (on ? ' on' : ''), 'data-line': sp.line }, layer);
        el('path', { d, class: 'as-bg' }, g);
        el('path', { d, class: 'as-fg' }, g);
        el('title', {}, g).textContent = x.title;
      }
    }
    const anchors = alertAnchors(x);
    const done = new Set();
    anchors.forEach(s => { const k = groupOf(s)[0]; if (done.has(k)) return; done.add(k); (byStation[k] = byStation[k] || []).push(x); });
    if (!anchors.length) x.lines.forEach(l => (lineOnly[l] = lineOnly[l] || []).push(x));
  });
  const worst = list => order.find(c => list.some(x => x.cat === c));
  for (const id in byStation) {
    const s = ST[id], list = byStation[id];
    const on = !selSet.size || groupOf(id).some(g => [...ST[g].lines].some(l => selSet.has(l)));
    const grp = el('g', { class: 'amark' + (on ? ' on' : ''), 'data-st': id }, layer);
    el('title', {}, grp).textContent = list.map(x => x.title).join('\n');
    alertIcon(worst(list), grp, s.x + 13, s.y - 14, list.length);
  }
  for (const lid in lineOnly) {
    const on = !selSet.size || selSet.has(lid);
    document.querySelectorAll(`#gDeco .badge[data-line="${lid}"]`).forEach(b => {
      const m = b.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/);
      const t = b.closest('.term'), ox = +(t?.dataset.dx || 0), oy = +(t?.dataset.dy || 0);
      const grp = el('g', { class: 'amark' + (on ? ' on' : ''), 'data-line': lid }, layer);
      el('title', {}, grp).textContent = lineOnly[lid].map(x => x.title).join('\n');
      alertIcon(worst(lineOnly[lid]), grp, +m[1] + ox + 20, +m[2] + oy - 13, lineOnly[lid].length);
    });
  }
}
function renderAlertToggles() {
  const box = $('#alertToggles');
  if (!box) return;
  box.innerHTML = Object.entries(ACATS).map(([k, c]) => {
    const n = ALERTS.filter(x => x.cat === k).length;
    return `<button data-acat="${k}" aria-pressed="${aOn.has(k)}" title="${c.name}"><svg viewBox="-12 -12 24 24" width="18" height="18"></svg><span>${c.name}</span><b>${n}</b></button>`;
  }).join('');
  box.querySelectorAll('button').forEach(b => alertIcon(b.dataset.acat, b.querySelector('svg'), 0, 0, 0));
  box.classList.toggle('empty', !ALERTS.length);
}
$('#alertToggles')?.addEventListener('click', e => {
  const b = e.target.closest('[data-acat]');
  if (!b) return;
  const k = b.dataset.acat;
  aOn.has(k) ? aOn.delete(k) : aOn.add(k);
  saveAOn(); renderAlertToggles(); renderAlertMarkers();
  if (stPanel && !selVeh) renderStationPanel();
  else if (sel && !selVeh && $('#info .lv')) showLineInfo(LINE[sel], focus);
});
const fmtDate = t => new Date(t * 1000).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function alertList(list) {
  if (!list.length) return '';
  const order = { traffic: 0, access: 1, info: 2 };
  list = [...list].sort((a, b) => order[a.cat] - order[b.cat]);
  return `<div class="branch">Störningar och meddelanden</div><ul class="alerts">${list.map(x => {
    const per = x.end ? `<div class="per">Till ${fmtDate(x.end)}</div>` : '';
    const lines = x.lines.length ? `<div class="al-lines">${x.lines.map(l => LINE[l] ? chip(LINE[l]) : '').join('')}</div>` : '';
    return `<li class="alert ${x.cat}${openAlerts[x.id] ? ' open' : ''}" data-aid="${x.id}"><svg viewBox="-12 -12 24 24" width="18" height="18" data-cat="${x.cat}"></svg>
      <div><div class="at">${x.title || ACATS[x.cat].name}</div><div class="ad">${(x.text || '').replace(/</g, '&lt;')}${per}${lines}</div></div></li>`;
  }).join('')}</ul>`;
}
// Rita ikonerna i panelens listor efter varje rendering
new MutationObserver(() => document.querySelectorAll('#info svg[data-cat]:empty').forEach(s => alertIcon(s.dataset.cat, s, 0, 0, 0)))
  .observe($('#info'), { childList: true, subtree: true });

/* ---------- Min position ----------
   GPS-läget räknas om till kartans schematiska koordinater: nära ett spår (< 500 m) hamnar
   pricken på linjen mellan de två närmaste stationerna, annars viktat mellan de tre närmaste
   stationerna med en streckad linje till den närmaste. */
const ME = { watch: null, coords: null, map: null, centered: false };
function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function geoToMap(lat, lon) {
  const G = SCHED.data?.geo;
  if (!G) return null;
  const c = Math.cos(lat * Math.PI / 180);
  const xy = sid => G[sid] && [(G[sid][1] - lon) * c * 111320, (G[sid][0] - lat) * 110540];
  const near = Object.keys(G).filter(s => ST[s] && ST[s].lines.size).map(s => { const p = xy(s); return [Math.hypot(p[0], p[1]), s]; })
    .sort((a, b) => a[0] - b[0]);
  if (!near.length || near[0][0] > 40000) return { outside: true, dist: near[0]?.[0] };
  // närmaste spårsträcka
  let best = null;
  for (const l of LINES) for (let i = 0; i < l.stops.length - 1; i++) {
    const A = xy(l.stops[i]), B = xy(l.stops[i + 1]);
    if (!A || !B) continue;
    const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, (-A[0] * dx - A[1] * dy) / L2)) : 0;
    const d = Math.hypot(A[0] + t * dx, A[1] + t * dy);
    if (!best || d < best.d) best = { d, line: l.id, a: l.stops[i], b: l.stops[i + 1], t };
  }
  const [dist, sid] = near[0];
  if (best && best.d < 500) {
    const p = pointOnLine(best.line, best.a, best.b, best.t);
    return { x: p.x, y: p.y, near: sid, dist, onTrack: true };
  }
  let wx = 0, wy = 0, ws = 0;
  near.slice(0, 3).forEach(([d, s]) => { const w = 1 / Math.max(d, 50) ** 2; wx += ST[s].x * w; wy += ST[s].y * w; ws += w; });
  return { x: wx / ws, y: wy / ws, near: sid, dist, onTrack: false };
}
const fmtDist = d => d < 950 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(d < 9500 ? 1 : 0).replace('.', ',')} km`;
function drawMe() {
  const g0 = $('#gMe');
  if (!ME.map || ME.map.outside) { g0.innerHTML = ''; return; }
  const m = ME.map, sx = m.x * view.k + view.tx, sy = m.y * view.k + view.ty;
  const S = ST[m.near], nx = S.x * view.k + view.tx, ny = S.y * view.k + view.ty;
  g0.innerHTML = (m.onTrack ? '' : `<line x1="${sx}" y1="${sy}" x2="${nx}" y2="${ny}" class="me-link"/>`) +
    `<circle cx="${sx}" cy="${sy}" r="16" class="me-halo"/><circle cx="${sx}" cy="${sy}" r="7.5" class="me-dot"/>`;
}
function updateMePill() {
  const p = $('#mepill');
  if (!ME.map) { p.classList.remove('show'); return; }
  if (ME.map.outside) { p.innerHTML = `Du är utanför kartan (${fmtDist(ME.map.dist)} till närmaste station)`; p.dataset.st = ''; }
  else { p.innerHTML = `<b>Du är här</b> · ${fmtDist(ME.map.dist)} till ${ST[ME.map.near].name}`; p.dataset.st = ME.map.near; }
  p.classList.add('show');
}
function centerOnMe() {
  if (!ME.map || ME.map.outside) return;
  const [cx, cy] = viewCenter(), k = Math.max(view.k, 1.2);
  animateTo({ k, tx: cx - ME.map.x * k, ty: cy - ME.map.y * k });
}
function locate() {
  if (!navigator.geolocation) return toast('Platstjänster stöds inte i den här webbläsaren.');
  if (ME.watch !== null) { if (ME.map) centerOnMe(); return; }
  $('#zme').classList.add('wait');
  const onPos = async p => {
    if (!SCHED.data) await loadSchedule();
    ME.coords = p.coords;
    ME.map = geoToMap(p.coords.latitude, p.coords.longitude);
    $('#zme').classList.remove('wait'); $('#zme').classList.add('on');
    if (!ME.map) { toast('Stationernas geografiska läge saknas – kör via servern eller GitHub Pages.'); return; }
    drawMe(); updateMePill();
    if (!ME.centered) { ME.centered = true; centerOnMe(); }
  };
  ME.watch = navigator.geolocation.watchPosition(onPos, e => {
    $('#zme').classList.remove('wait', 'on');
    navigator.geolocation.clearWatch(ME.watch); ME.watch = null;
    toast(e.code === 1 ? 'Platsåtkomst nekad – tillåt plats för sidan i webbläsaren.' : 'Kunde inte hitta din position.');
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
}
$('#zme')?.addEventListener('click', locate);
$('#mepill')?.addEventListener('click', e => { const s = e.currentTarget.dataset.st; if (s) showStation(s); });

/* ---------- Valt fordon: tur med ankomsttider ---------- */
const hhmm = t => new Date(t * 1000).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
function zoomToStation(id, minK = 1.6) {
  const s = ST[id], W = svg.clientWidth, H = svg.clientHeight, k = Math.max(view.k, minK);
  const [cx, cy] = viewCenter();
  animateTo({ k, tx: cx - s.x * k, ty: cy - s.y * k });
}
function setFollow(on) {
  follow = on;
  const b = $('#info .follow');
  if (b) { b.classList.toggle('on', on); b.textContent = on ? 'Följer fordonet' : 'Följ fordonet'; }
}
function followStep() {
  if (!follow || !selVeh || animating || pointers.size) return;
  const V = vehicles.get(selVeh);
  if (!V) return;
  const W = svg.clientWidth, H = svg.clientHeight, mob = W < 760;
  const [cx, cy] = viewCenter();
  const dx = cx - (V.cur.x * view.k + view.tx), dy = cy - (V.cur.y * view.k + view.ty);
  if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
  view.tx += dx * 0.08; view.ty += dy * 0.08;
  applyView();
}
function showVehicle(id) {
  const V = vehicles.get(id), v = live.veh.get(id);
  if (!V) return;
  if (!v) return selectLine(V.line, false);          // demofordon saknar tidtabell
  if (sel !== v.line) selectLine(v.line, false);
  setFocus(null);
  selVeh = id;
  document.querySelectorAll('.veh.vsel').forEach(e => e.classList.remove('vsel'));
  vehEls.get(id).classList.add('vsel');
  renderVehPanel(true);
  const W = svg.clientWidth, H = svg.clientHeight, mob = W < 760, k = Math.max(view.k, 1.5);
  const [cx, cy] = viewCenter();
  animateTo({ k, tx: cx - V.cur.x * k, ty: cy - V.cur.y * k });
  setTimeout(() => selVeh === id && setFollow(true), 520);
}
function renderVehPanel(first) {
  const info = $('#info'), v = live.veh.get(selVeh);
  if (!v) {
    const sub = info.querySelector('.sub');
    if (sub) sub.textContent = 'Fordonet finns inte längre i realtidsflödet.';
    return;
  }
  const l = LINE[v.line], now = Date.now() / 1000 + live.skew, p = v.pos || livePos(v, now);
  const n = v.stops.length;
  const next = p.at >= 0 ? p.at : p.seg + 1;      // första stopp som inte passerats
  const rows = [];
  for (let i = 0; i < n; i++) {
    const sched = i === 0 ? v.dep[0] : v.arr[i], est = sched + v.delay;
    const passed = i < next, here = i === p.at;
    const late = Math.abs(v.delay) >= 60 && !passed;
    const mins = Math.round((est - now) / 60);
    const rel = here ? 'här nu' : !passed && i >= next ? (mins <= 0 ? 'nu' : `${mins} min`) : '';
    const plat = v.plat && v.plat[i] ? `<span class="pl">spår ${v.plat[i]}</span>` : '';
    if (i === p.seg + 1 && p.at < 0) rows.push(`<li class="mark"><span class="tm"></span><span class="nm">Mellan ${ST[v.stops[p.seg]].name} och ${ST[v.stops[i]].name}</span></li>`);
    rows.push(`<li data-zoom="${v.stops[i]}" class="${passed && !here ? 'passed' : ''}${here ? ' here' : ''}${i === next && !here ? ' next' : ''}">
      <span class="tm">${hhmm(est)}${late ? `<s>${hhmm(sched)}</s>` : ''}</span>
      <span class="nm">${ST[v.stops[i]].name}${plat}</span><span class="rel">${rel}</span></li>`);
  }
  const delayTxt = Math.abs(v.delay) < 60 ? 'I tid' : v.delay > 0 ? `${Math.round(v.delay / 60)} min sen` : `${Math.round(-v.delay / 60)} min tidig`;
  const upd = live.data && live.data.updated ? hhmm(live.data.updated) + ':' + String(new Date(live.data.updated * 1000).getSeconds()).padStart(2, '0') : '';
  const scroll = info.querySelector('ol')?.parentNode === info ? info.scrollTop : 0;
  info.style.setProperty('--c', colorOf(l));
  info.innerHTML = `${GRAB}<div class="hd"><button class="close" aria-label="Stäng">×</button>
    <h2>${chip(l)}<span>mot ${ST[v.to].name}</span></h2>
    <div class="sub">${l.name} · ${v.sched
      ? `<b>Enligt tidtabell</b>${v.delayKnown ? ` + senaste försening (${fmtDelay(v.delay)})` : ''}`
      : `<b class="${v.delay >= 120 ? 'bad' : ''}">${delayTxt}</b> · position ${upd}`}</div>
    </div>
    <ol class="trip">${rows.join('')}</ol>
    <div class="foot">Tider = tidtabell + aktuell försening (beräknat). Fordon ${v.id}</div>`;
  info.classList.add('show');
  if (first) { const nx = info.querySelector('li.next,li.here'); if (nx) nx.scrollIntoView({ block: 'center' }); }
  else info.scrollTop = scroll;
}
setInterval(() => selVeh && renderVehPanel(), 1000);

function status() {
  const el = $('#vstatus');
  if (!el) return;
  if (mode === 'live') {
    const d = live.data;
    if (!d || !d.updated) { el.innerHTML = '<i class="dot-live wait"></i>Väntar på första realtidsdata…'; return; }
    const age = Math.round(Date.now() / 1000 + live.skew - d.updated);
    const t = new Date(d.updated * 1000).toLocaleTimeString('sv-SE');
    if (live.snapshot) { el.innerHTML = `<i class="dot-live wait"></i>${live.veh.size} fordon · ögonblicksbild ${t}`; el.title = 'Riktiga positioner från Trafiklab, uppspelade från tidpunkten då bilden togs.'; return; }
    el.innerHTML = `<i class="dot-live${d.error ? ' err' : ''}"></i>${live.veh.size} fordon · ${t}` +
      (d.error ? ` · <span title="${d.error.replace(/"/g, '')}">fel</span>` : '');
    el.title = `Senast uppdaterad för ${age} s sedan. Servern hämtar ny data var ${Math.round(d.poll)}:e sekund.`;
  } else if (mode === 'demo') el.textContent = live.ok ? 'Simulerade fordon' : 'Simulerade fordon (ingen server)';
  else if (mode === 'api') el.textContent = 'Fordon via API';
  else el.textContent = 'Fordon dolda';
}
setInterval(() => mode === 'live' && status(), 5000);
setInterval(() => mode === 'live' && loadSchedule(), 3 * 3600 * 1000);
$('#modes')?.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mode === 'live' && !live.ok) { live.tried = false; mode = 'off'; setMode('live'); return; }
  setMode(b.dataset.mode);
});

window.TrackMap = {
  lines: LINE, stations: ST, setVehicles, removeVehicle, pointOnLine,
  selectLine, clearSelection: clearSel, showStation, startDemo, stopDemo,
  stationIdByName: n => byName[String(n).toLowerCase()], setMode,
  setView: (k, tx, ty) => { Object.assign(view, { k, tx, ty }); applyView(); },
};

(document.fonts?.ready || Promise.resolve()).then(() => fitText.forEach(([t, w]) => {
  if (t.getComputedTextLength() > w) { t.setAttribute('textLength', w); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
}));
startView();
// Starta i live-läge om servern svarar, annars demo
if (/nodemo/.test(location.hash)) setMode('off');
else if (location.protocol.startsWith('http') || window.SNAPSHOT) setMode('live');
else setMode('demo');
})();
