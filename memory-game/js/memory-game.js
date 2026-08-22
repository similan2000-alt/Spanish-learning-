const MISMATCH_DELAY_MS = 800;
const STORAGE_KEY = 'memory_game_stats_v1';

const state = {
  stageIndex: 0,
  cards: [],
  openIndexes: [],
  locked: false,
  moves: 0,
  pairsFound: 0,
  pairsTotal: 0,
};

const stats = loadStats();

const screens = {
  home: document.getElementById('screen-home'),
  game: document.getElementById('screen-game'),
};

const stageList = document.getElementById('stageList');
const movesVal = document.getElementById('movesVal');
const stageLabel = document.getElementById('stageLabel');
const pairsFoundVal = document.getElementById('pairsFoundVal');
const pairsTotalVal = document.getElementById('pairsTotalVal');
const board = document.getElementById('board');
const resultOverlay = document.getElementById('resultOverlay');
const resultEmoji = document.getElementById('resultEmoji');
const resultTitle = document.getElementById('resultTitle');
const resultText = document.getElementById('resultText');
const nextStageBtn = document.getElementById('nextStageBtn');

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { bestMovesByStage: {} };
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function renderStageList() {
  stageList.innerHTML = '';
  STAGES.forEach((stage, idx) => {
    const row = document.createElement('div');
    row.className = 'stage-row';
    const best = stats.bestMovesByStage[stage.level];
    row.innerHTML = `<span>שלב ${idx + 1}</span><span class="stage-size">${stage.label}${best ? ` · שיא: ${best} מהלכים` : ''}</span>`;
    stageList.appendChild(row);
  });
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('active', key === name);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildStage(stageIndex) {
  const stage = STAGES[stageIndex];
  const totalCards = stage.rows * stage.cols;
  const pairsNeeded = totalCards / 2;
  const chosenSymbols = shuffle(SYMBOLS).slice(0, pairsNeeded);
  const deck = shuffle([...chosenSymbols, ...chosenSymbols]).map((symbol, idx) => ({
    id: idx,
    symbol,
    flipped: false,
    matched: false,
  }));

  state.stageIndex = stageIndex;
  state.cards = deck;
  state.openIndexes = [];
  state.locked = false;
  state.moves = 0;
  state.pairsFound = 0;
  state.pairsTotal = pairsNeeded;

  stageLabel.textContent = `שלב ${stageIndex + 1} · ${stage.label}`;
  movesVal.textContent = '0';
  pairsFoundVal.textContent = '0';
  pairsTotalVal.textContent = String(pairsNeeded);

  board.style.gridTemplateColumns = `repeat(${stage.cols}, 1fr)`;
  renderBoard();
}

function renderBoard() {
  board.innerHTML = '';
  state.cards.forEach((card, idx) => {
    const btn = document.createElement('button');
    btn.className = 'card';
    if (card.flipped) btn.classList.add('flipped');
    if (card.matched) btn.classList.add('matched');
    btn.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back"></div>
        <div class="card-face card-front">${card.symbol}</div>
      </div>`;
    btn.addEventListener('click', () => handleCardClick(idx));
    board.appendChild(btn);
  });
}

function handleCardClick(idx) {
  const card = state.cards[idx];
  if (state.locked || card.flipped || card.matched) return;

  card.flipped = true;
  state.openIndexes.push(idx);
  renderBoard();

  if (state.openIndexes.length < 2) return;

  state.moves += 1;
  movesVal.textContent = String(state.moves);

  const [firstIdx, secondIdx] = state.openIndexes;
  const first = state.cards[firstIdx];
  const second = state.cards[secondIdx];

  if (first.symbol === second.symbol) {
    first.matched = true;
    second.matched = true;
    state.openIndexes = [];
    state.pairsFound += 1;
    pairsFoundVal.textContent = String(state.pairsFound);
    renderBoard();
    if (state.pairsFound === state.pairsTotal) {
      onStageComplete();
    }
    return;
  }

  state.locked = true;
  setTimeout(() => {
    first.flipped = false;
    second.flipped = false;
    state.openIndexes = [];
    state.locked = false;
    renderBoard();
  }, MISMATCH_DELAY_MS);
}

function onStageComplete() {
  const stage = STAGES[state.stageIndex];
  const best = stats.bestMovesByStage[stage.level];
  if (!best || state.moves < best) {
    stats.bestMovesByStage[stage.level] = state.moves;
    saveStats();
  }
  renderStageList();

  const isLastStage = state.stageIndex === STAGES.length - 1;
  resultEmoji.textContent = isLastStage ? '🏆' : '🎉';
  resultTitle.textContent = isLastStage ? 'ניצחתם את כל המשחק!' : 'כל הכבוד! שלב הושלם';
  resultText.textContent = isLastStage
    ? `סיימתם את כל 4 השלבים! (${state.moves} מהלכים בשלב האחרון)`
    : `מצאתם את כל הזוגות ב-${state.moves} מהלכים.`;
  nextStageBtn.textContent = isLastStage ? 'שחקו שוב מהתחלה' : 'לשלב הבא';
  resultOverlay.classList.add('active');
}

nextStageBtn.addEventListener('click', () => {
  resultOverlay.classList.remove('active');
  const isLastStage = state.stageIndex === STAGES.length - 1;
  const nextIndex = isLastStage ? 0 : state.stageIndex + 1;
  buildStage(nextIndex);
});

document.getElementById('backHomeBtn').addEventListener('click', () => {
  resultOverlay.classList.remove('active');
  showScreen('home');
});

document.getElementById('exitGameBtn').addEventListener('click', () => {
  resultOverlay.classList.remove('active');
  showScreen('home');
});

document.getElementById('startBtn').addEventListener('click', () => {
  showScreen('game');
  buildStage(0);
});

renderStageList();
showScreen('home');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
