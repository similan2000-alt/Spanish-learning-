// Blind-map geography game: pick a category (Israeli cities or a continent's
// countries), guess the highlighted region from a rotating pool of choices.
// Reuses showScreen()/shuffle() from app.js (loaded first) and the geo paths
// from js/mapgame-data.js.

const MAP_STORAGE_KEY = 'mapGamesState_v1';
const POOL_SIZE = 10;

const MAP_CATEGORIES = [
  { key: 'israel_cities', name: 'ערי ישראל', emoji: '🏙️', color: 'cat-cyan' },
  { key: 'europe', name: 'מדינות אירופה', emoji: '🇪🇺', color: 'cat-blue' },
  { key: 'north_america', name: 'אמריקה הצפונית', emoji: '🌎', color: 'cat-yellow' },
  { key: 'latin_america', name: 'אמריקה הלטינית', emoji: '🌎', color: 'cat-green' },
  { key: 'asia', name: 'מדינות אסיה', emoji: '🌏', color: 'cat-cyan' },
  { key: 'africa', name: 'מדינות אפריקה', emoji: '🌍', color: 'cat-blue' },
];

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
  svg.setAttribute('viewBox', mapGame.geo.viewBox);
  svg.innerHTML = '';
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
  svg.appendChild(frag);
}

function setTargetHighlight(id) {
  document.querySelectorAll('#mapSvg .map-region').forEach((el) => {
    el.classList.toggle('is-target', el.getAttribute('data-id') === id);
  });
}

function zoomToFull() {
  document.getElementById('mapSvg').setAttribute('viewBox', mapGame.geo.viewBox);
}

function zoomToTarget(id) {
  const svg = document.getElementById('mapSvg');
  const el = svg.querySelector(`path[data-id="${id}"]`);
  if (!el) return;
  const bbox = el.getBBox();
  const [, , fullW, fullH] = mapGame.geo.viewBox.split(' ').map(Number);
  const minSide = Math.max(fullW, fullH) * 0.08;
  const side = Math.max(Math.max(bbox.width, bbox.height) * 2.6, minSide);
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  svg.setAttribute('viewBox', `${(cx - side / 2).toFixed(1)} ${(cy - side / 2).toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`);
}

function buildMapOptions(target) {
  const names = new Set([target.name]);
  shuffle(mapGame.pool.filter((it) => it.id !== target.id)).forEach((it) => {
    if (names.size < Math.min(POOL_SIZE, mapGame.geo.items.length)) names.add(it.name);
  });
  if (names.size < Math.min(POOL_SIZE, mapGame.geo.items.length)) {
    shuffle(mapGame.geo.items.filter((it) => !names.has(it.name))).forEach((it) => {
      if (names.size < Math.min(POOL_SIZE, mapGame.geo.items.length)) names.add(it.name);
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
  zoomToTarget(target.id);
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
    zoomToFull();
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
  document.getElementById('openMapGamesBtn').addEventListener('click', openMapGames);
  document.getElementById('mapCategoriesBackBtn').addEventListener('click', () => showScreen('home'));
  document.getElementById('mapGameExitBtn').addEventListener('click', () => {
    if (confirm('לצאת מהמשחק? ההתקדמות שנשמרה עד כה תישאר.')) openMapGames();
  });
  document.getElementById('mapBackToCategoriesBtn').addEventListener('click', openMapGames);
  document.getElementById('mapPlayAgainBtn').addEventListener('click', () => {
    resetMapCategory(mapGame.key);
    startMapCategory(mapGame.key);
  });
});
