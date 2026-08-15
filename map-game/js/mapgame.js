// Blind-map geography game (standalone app): pick a category (Israeli
// cities or a continent's countries), guess the highlighted region from a
// rotating pool of choices. Reads geo paths from js/mapgame-data.js.

const MAP_STORAGE_KEY = 'mapGamesState_v2';
const POOL_SIZE = 4;

const MAP_CATEGORIES = [
  { key: 'israel_cities', name: 'ערי ישראל', emoji: '🏙️', color: 'cat-cyan' },
  { key: 'europe', name: 'מדינות אירופה', emoji: '🇪🇺', color: 'cat-blue' },
  { key: 'us_states', name: 'מדינות ארה"ב', emoji: '🇺🇸', color: 'cat-yellow' },
  { key: 'south_america', name: 'דרום אמריקה', emoji: '🌎', color: 'cat-green' },
  { key: 'asia', name: 'מדינות אסיה', emoji: '🌏', color: 'cat-cyan' },
  { key: 'africa', name: 'מדינות אפריקה', emoji: '🌍', color: 'cat-blue' },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function loadMapState() {
  let raw = null;
  try { raw = localStorage.getItem(MAP_STORAGE_KEY); } catch (e) { /* ignore */ }
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  return {};
}
function saveMapState() {
  try { localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(mapState)); } catch (e) { /* ignore */ }
}
let mapState = loadMapState();

function catProgress(key) {
  const geo = MAPGAME_GEO[key];
  const solved = (mapState[key] && mapState[key].solvedIds) || [];
  return { solved: solved.length, total: geo.items.length, score: (mapState[key] && mapState[key].score) || 0 };
}

// ---- Category picker ----
function renderMapCategoryGrid() {
  const grid = document.getElementById('mapCategoryGrid');
  grid.innerHTML = '';
  MAP_CATEGORIES.forEach((cat) => {
    const p = catProgress(cat.key);
    const btn = document.createElement('button');
    btn.className = `map-cat-card ${cat.color}`;
    btn.innerHTML = `
      <span class="map-cat-emoji">${cat.emoji}</span>
      <span class="map-cat-name">${cat.name}</span>
      <span class="map-cat-progress">${p.solved}/${p.total} נפתרו · ${p.score} נק׳</span>
    `;
    btn.addEventListener('click', () => startMapCategory(cat.key));
    grid.appendChild(btn);
  });
}

function openMapGames() {
  renderMapCategoryGrid();
  showScreen('map-categories');
}

// ---- Pinch-zoom / pan controller for the map SVG ----
// Keeps a translate+scale transform on the inner <g>, driven by Pointer
// Events so mouse drag, wheel, and touch pinch all go through the same math.
function createPanZoom(svg, group) {
  const MIN_SCALE = 1;
  const MAX_SCALE = 20;
  let scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let lastDist = 0, lastMid = null;

  function apply() {
    group.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
  }
  function reset() {
    scale = 1; tx = 0; ty = 0; apply();
  }
  function fitScale() {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!rect.width || !rect.height || !vb.width || !vb.height) return 1;
    return Math.min(rect.width / vb.width, rect.height / vb.height);
  }
  // Client (screen) point -> SVG viewBox-space point, ignoring our own
  // translate/scale (i.e. the space the group's transform is defined in).
  function svgPointFromClient(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const fs = fitScale();
    const offsetX = (rect.width - vb.width * fs) / 2;
    const offsetY = (rect.height - vb.height * fs) / 2;
    return {
      x: vb.x + (clientX - rect.left - offsetX) / fs,
      y: vb.y + (clientY - rect.top - offsetY) / fs,
    };
  }
  function zoomAt(clientX, clientY, factor) {
    const before = svgPointFromClient(clientX, clientY);
    const oldScale = scale;
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const applied = scale / oldScale;
    tx = tx * applied + before.x * (1 - applied);
    ty = ty * applied + before.y * (1 - applied);
    apply();
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  svg.addEventListener('pointerdown', (e) => {
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not a capturable pointer (e.g. synthetic) - ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastDist = dist(a, b);
      lastMid = mid(a, b);
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const fs = fitScale();

    if (pointers.size === 1) {
      tx += (e.clientX - prev.x) / fs;
      ty += (e.clientY - prev.y) / fs;
      apply();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const newDist = dist(a, b);
      const newMid = mid(a, b);
      if (lastDist > 0) zoomAt(newMid.x, newMid.y, newDist / lastDist);
      if (lastMid) {
        tx += (newMid.x - lastMid.x) / fs;
        ty += (newMid.y - lastMid.y) / fs;
        apply();
      }
      lastDist = newDist;
      lastMid = newMid;
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) { lastDist = 0; lastMid = null; }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('pointerleave', endPointer);

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  return { reset };
}

let mapPanZoom = null;

// ---- Game runtime ----
let mapGame = null; // { key, geo, remaining:[...], pool:[...], target, options, attempts }

function ensureCatState(key) {
  if (!mapState[key]) mapState[key] = { solvedIds: [], score: 0 };
  return mapState[key];
}

function refillPool() {
  while (mapGame.pool.length < POOL_SIZE && mapGame.remaining.length > mapGame.pool.length) {
    const next = mapGame.remaining.find((it) => !mapGame.pool.includes(it));
    if (!next) break;
    mapGame.pool.push(next);
  }
}

function startMapCategory(key) {
  const geo = MAPGAME_GEO[key];
  const st = ensureCatState(key);
  const solvedSet = new Set(st.solvedIds);
  const remaining = geo.items.slice().sort((a, b) => a.order - b.order).filter((it) => !solvedSet.has(it.id));

  mapGame = { key, geo, remaining, pool: [] };
  refillPool();

  showScreen('map-game');
  document.getElementById('mapGameCatName').textContent = MAP_CATEGORIES.find((c) => c.key === key).name;
  renderMapSvg();
  updateMapHeader();

  if (mapGame.remaining.length === 0) {
    finishMapCategory();
    return;
  }
  nextMapQuestion();
}

function updateMapHeader() {
  const st = ensureCatState(mapGame.key);
  document.getElementById('mapGameSolved').textContent = st.solvedIds.length;
  document.getElementById('mapGameTotal').textContent = mapGame.geo.items.length;
  document.getElementById('mapGameScore').textContent = `${st.score} נק׳`;
}

function renderMapSvg() {
  const svg = document.getElementById('mapSvg');
  const group = document.getElementById('mapZoomG');
  svg.setAttribute('viewBox', mapGame.geo.viewBox);
  group.innerHTML = '';
  const st = ensureCatState(mapGame.key);
  const solvedSet = new Set(st.solvedIds);

  const frag = document.createDocumentFragment();
  mapGame.geo.items.forEach((it) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', it.d);
    path.setAttribute('data-id', it.id);
    path.setAttribute('class', 'map-region' + (solvedSet.has(it.id) ? ' is-solved' : ''));
    frag.appendChild(path);
    if (solvedSet.has(it.id)) {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', it.cx);
      label.setAttribute('y', it.cy);
      label.setAttribute('class', 'map-label');
      label.textContent = it.name;
      frag.appendChild(label);
    }
  });
  if (mapGame.geo.outline) {
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    outline.setAttribute('d', mapGame.geo.outline);
    outline.setAttribute('class', 'map-outline');
    frag.appendChild(outline);
  }
  group.appendChild(frag);

  if (!mapPanZoom) mapPanZoom = createPanZoom(svg, group);
  mapPanZoom.reset();
}

function setTargetHighlight(id) {
  document.querySelectorAll('#mapSvg .map-region').forEach((el) => {
    el.classList.toggle('is-target', el.getAttribute('data-id') === id);
  });
}

function buildMapOptions(target) {
  const size = Math.min(POOL_SIZE, mapGame.geo.items.length);
  const names = new Set([target.name]);
  shuffle(mapGame.pool.filter((it) => it.id !== target.id)).forEach((it) => {
    if (names.size < size) names.add(it.name);
  });
  if (names.size < size) {
    shuffle(mapGame.geo.items.filter((it) => !names.has(it.name))).forEach((it) => {
      if (names.size < size) names.add(it.name);
    });
  }
  return shuffle([...names]);
}

function nextMapQuestion() {
  refillPool();
  if (!mapGame.pool.length) { finishMapCategory(); return; }
  const target = mapGame.pool[Math.floor(Math.random() * mapGame.pool.length)];
  mapGame.target = target;
  mapGame.attempts = 0;
  mapGame.options = buildMapOptions(target);

  setTargetHighlight(target.id);
  if (mapPanZoom) mapPanZoom.reset();
  document.getElementById('mapFeedback').textContent = '';
  document.getElementById('mapFeedback').className = 'map-feedback';
  renderMapOptions();
}

function renderMapOptions() {
  const grid = document.getElementById('mapOptionsGrid');
  grid.innerHTML = '';
  mapGame.options.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'map-option-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => handleMapOptionClick(name, btn));
    grid.appendChild(btn);
  });
}

function handleMapOptionClick(name, btn) {
  if (btn.classList.contains('disabled')) return;
  const feedback = document.getElementById('mapFeedback');

  if (name === mapGame.target.name) {
    btn.classList.add('correct');
    document.querySelectorAll('.map-option-btn').forEach((b) => b.classList.add('disabled'));
    feedback.textContent = '✅ נכון!';
    feedback.className = 'map-feedback ok';

    const points = mapGame.attempts === 0 ? 10 : (mapGame.attempts === 1 ? 4 : 2);
    const st = ensureCatState(mapGame.key);
    st.score += points;
    st.solvedIds.push(mapGame.target.id);
    saveMapState();

    mapGame.remaining = mapGame.remaining.filter((it) => it.id !== mapGame.target.id);
    mapGame.pool = mapGame.pool.filter((it) => it.id !== mapGame.target.id);

    renderMapSvg();
    updateMapHeader();

    setTimeout(() => {
      if (mapGame.remaining.length === 0) finishMapCategory();
      else nextMapQuestion();
    }, 700);
  } else {
    btn.classList.add('wrong', 'disabled');
    mapGame.attempts++;
    feedback.textContent = '❌ נסה שוב';
    feedback.className = 'map-feedback bad';
  }
}

function finishMapCategory() {
  const st = ensureCatState(mapGame.key);
  document.getElementById('mapCompleteCatName').textContent =
    MAP_CATEGORIES.find((c) => c.key === mapGame.key).name;
  document.getElementById('mapCompleteScore').textContent = st.score;
  showScreen('map-complete');
}

function resetMapCategory(key) {
  mapState[key] = { solvedIds: [], score: 0 };
  saveMapState();
}

// ---- DOM wiring ----
document.addEventListener('DOMContentLoaded', () => {
  openMapGames();

  document.getElementById('mapGameExitBtn').addEventListener('click', () => {
    if (confirm('לצאת מהמשחק? ההתקדמות שנשמרה עד כה תישאר.')) openMapGames();
  });
  document.getElementById('mapBackToCategoriesBtn').addEventListener('click', openMapGames);
  document.getElementById('mapPlayAgainBtn').addEventListener('click', () => {
    resetMapCategory(mapGame.key);
    startMapCategory(mapGame.key);
  });
  document.getElementById('mapResetViewBtn').addEventListener('click', () => {
    if (mapPanZoom) mapPanZoom.reset();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});
