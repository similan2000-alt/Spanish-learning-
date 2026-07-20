// Spanish -> Hebrew flashcard learning app.
// Persists progress in localStorage and drives one 15-word session at a time.

const STORAGE_KEY = 'esHeFlashcards_v1';
const MASTERY_TARGET = 5; // times a word must be answered correctly (total) before it's "known"
const SESSION_SIZE = 15;
const REQUEUE_GAP = 2; // wrong answers reappear after this many other cards
const INITIAL_UNLOCK = 20;

// ---- Spanish pronunciation (Web Speech API, female voice preferred) ----
let cachedSpanishVoice = null;
let spanishVoiceReady = false;

function pickSpanishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const esVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
  if (!esVoices.length) return null;
  const femaleHints = ['female', 'mujer', 'woman', 'monica', 'mónica', 'paulina', 'lucia', 'lucía', 'esperanza', 'elena', 'conchita', 'camila'];
  const female = esVoices.find(v => femaleHints.some(hint => v.name.toLowerCase().includes(hint)));
  return female || esVoices[0];
}

function refreshSpanishVoice() {
  const voice = pickSpanishVoice();
  if (voice) {
    cachedSpanishVoice = voice;
    spanishVoiceReady = true;
  }
}

if ('speechSynthesis' in window) {
  refreshSpanishVoice();
  speechSynthesis.onvoiceschanged = refreshSpanishVoice;
}

function speakSpanish(text) {
  if (!('speechSynthesis' in window) || !text) return;
  // Some Android browsers hang or drop later calls if cancel() and speak()
  // are invoked back-to-back synchronously. Only cancel when something is
  // actually still playing, run it on the next tick so it never blocks the
  // card/session flow, and never let a speech error break the app.
  setTimeout(() => {
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = cachedSpanishVoice ? cachedSpanishVoice.lang : 'es-ES';
      if (cachedSpanishVoice) utter.voice = cachedSpanishVoice;
      utter.rate = 0.9;
      utter.pitch = 1.1;
      speechSynthesis.speak(utter);
    } catch (e) {
      /* ignore - pronunciation is a nice-to-have, never block the app */
    }
  }, 0);
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.progress) return parsed;
    } catch (e) { /* fall through to default */ }
  }
  return { progress: {}, unlockedCount: INITIAL_UNLOCK, sessionsCompleted: 0 };
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

let state = loadState();

function getCorrectCount(id) {
  return state.progress[id] || 0;
}
function isMastered(id) {
  return getCorrectCount(id) >= MASTERY_TARGET;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ensureUnlockCoverage() {
  // Make sure there are at least SESSION_SIZE unmastered words available;
  // otherwise open up more of the (harder) word list.
  let unlocked = WORDS.filter(w => w.rank <= state.unlockedCount);
  let unmastered = unlocked.filter(w => !isMastered(w.id));
  while (unmastered.length < SESSION_SIZE && state.unlockedCount < WORDS.length) {
    state.unlockedCount = Math.min(WORDS.length, state.unlockedCount + 10);
    unlocked = WORDS.filter(w => w.rank <= state.unlockedCount);
    unmastered = unlocked.filter(w => !isMastered(w.id));
  }
}

function pickWeightedFront(sortedByRank, n) {
  // Favor important (low-rank) words while still picking somewhat randomly,
  // so sessions feel varied instead of always the exact same order.
  const windowSize = Math.min(sortedByRank.length, Math.max(n * 3, n + 5));
  const pool = sortedByRank.slice(0, windowSize);
  return shuffle(pool).slice(0, n);
}

function reviewPriorityOrder(candidates) {
  // Words closer to mastery (higher correctCount) are prioritized so they get
  // finished off instead of being crowded out by a constant stream of new
  // words; within the same progress tier, order is randomized.
  const tiers = {};
  candidates.forEach(w => {
    const c = getCorrectCount(w.id);
    (tiers[c] = tiers[c] || []).push(w);
  });
  return Object.keys(tiers)
    .map(Number)
    .sort((a, b) => b - a)
    .flatMap(count => shuffle(tiers[count]));
}

function buildSession() {
  ensureUnlockCoverage();
  const unlocked = WORDS.filter(w => w.rank <= state.unlockedCount);
  const unmastered = unlocked.filter(w => !isMastered(w.id));

  const review = reviewPriorityOrder(unmastered.filter(w => getCorrectCount(w.id) > 0));
  const fresh = unmastered
    .filter(w => getCorrectCount(w.id) === 0)
    .sort((a, b) => a.rank - b.rank);

  const reviewSlots = Math.min(review.length, Math.ceil(SESSION_SIZE * 0.6));
  let session = shuffle(review.slice(0, reviewSlots));

  let remaining = SESSION_SIZE - session.length;
  const freshPicked = pickWeightedFront(fresh, remaining);
  session = session.concat(freshPicked);

  remaining = SESSION_SIZE - session.length;
  if (remaining > 0) {
    // Not enough unmastered words unlocked (edge case near full mastery) -
    // top up with any remaining unmastered words, then mastered ones as review practice.
    const usedIds = new Set(session.map(w => w.id));
    const leftoverUnmastered = unmastered.filter(w => !usedIds.has(w.id));
    session = session.concat(shuffle(leftoverUnmastered).slice(0, remaining));
    remaining = SESSION_SIZE - session.length;
  }
  if (remaining > 0) {
    const usedIds = new Set(session.map(w => w.id));
    const masteredWords = WORDS.filter(w => !usedIds.has(w.id) && w.rank <= state.unlockedCount);
    session = session.concat(shuffle(masteredWords).slice(0, remaining));
  }

  return shuffle(session).slice(0, SESSION_SIZE);
}

// ---- Session runtime state ----
let session = null; // { words: [...], queue: [ids...], firstTryCorrect: 0, masteredNow: 0, missedOnce: Set, currentId: null, revealed: false }

function startSession() {
  const words = buildSession();
  session = {
    words,
    byId: Object.fromEntries(words.map(w => [w.id, w])),
    queue: shuffle(words.map(w => w.id)),
    total: words.length,
    doneIds: new Set(),
    firstTryCorrect: 0,
    masteredNow: 0,
    everMissed: new Set(),
    currentId: null,
    revealed: false,
  };
  showScreen('session');
  nextCard();
}

function nextCard() {
  if (!session.queue.length) {
    finishSession();
    return;
  }
  session.currentId = session.queue.shift();
  session.revealed = false;
  renderCard();
}

function renderCard() {
  const word = session.byId[session.currentId];
  els.answerButtons.classList.remove('show');

  // Snap the flip back to front instantly (no animation) before swapping in
  // the new word's text - otherwise the back face still shows mid-rotation
  // while it's spinning back, briefly revealing the next word's translation.
  els.flashcard.classList.add('no-transition');
  els.flashcard.classList.remove('flipped');
  void els.flashcard.offsetWidth; // force reflow so the instant reset applies
  els.wordEs.textContent = word.es;
  els.wordHe.textContent = word.he;
  requestAnimationFrame(() => {
    els.flashcard.classList.remove('no-transition');
  });
  speakSpanish(word.es);

  const cc = getCorrectCount(word.id);
  els.cardMastery.textContent = `התקדמות: ${cc}/${MASTERY_TARGET}`;
  updateSessionProgressUI();
}

function revealCard() {
  if (session.revealed) return;
  session.revealed = true;
  els.flashcard.classList.add('flipped');
  els.answerButtons.classList.add('show');
}

function answerWrong() {
  const id = session.currentId;
  session.everMissed.add(id);
  const gap = Math.min(REQUEUE_GAP, session.queue.length);
  session.queue.splice(gap, 0, id);
  nextCard();
}

function answerCorrect() {
  const id = session.currentId;
  const wasFirstTry = !session.everMissed.has(id);
  const cc = Math.min(MASTERY_TARGET, getCorrectCount(id) + 1);
  state.progress[id] = cc;
  if (cc >= MASTERY_TARGET) session.masteredNow++;
  if (wasFirstTry) session.firstTryCorrect++;
  session.doneIds.add(id);
  saveState();
  nextCard();
}

function updateSessionProgressUI() {
  const done = session.doneIds.size;
  els.sessionDone.textContent = done;
  els.sessionTotal.textContent = session.total;
  els.sessionProgressFill.style.width = `${(done / session.total) * 100}%`;
  els.streakBadge.textContent = `🔥 ${session.firstTryCorrect}`;
}

function finishSession() {
  state.sessionsCompleted += 1;
  const accuracy = session.firstTryCorrect / session.total;
  let bonus = 5;
  if (accuracy >= 0.8) bonus = 25;
  else if (accuracy >= 0.5) bonus = 15;
  state.unlockedCount = Math.min(WORDS.length, state.unlockedCount + bonus);
  saveState();

  els.doneCorrectFirst.textContent = session.firstTryCorrect;
  els.doneMasteredNow.textContent = session.masteredNow;
  showScreen('complete');
}

// ---- Home / stats rendering ----
function refreshHomeStats() {
  const mastered = WORDS.filter(w => isMastered(w.id)).length;
  const inProgress = WORDS.filter(w => !isMastered(w.id) && getCorrectCount(w.id) > 0).length;
  els.homeMastered.textContent = mastered;
  els.homeInProgress.textContent = inProgress;
  els.homeUnlocked.textContent = Math.min(state.unlockedCount, WORDS.length);
  els.homeProgressFill.style.width = `${(mastered / WORDS.length) * 100}%`;
}

function renderStatsGrid() {
  els.statsGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  WORDS.forEach(w => {
    const cell = document.createElement('div');
    const cc = getCorrectCount(w.id);
    let cls = 'cell-locked';
    if (isMastered(w.id)) cls = 'cell-mastered';
    else if (cc > 0) cls = 'cell-progress';
    else if (w.rank <= state.unlockedCount) cls = 'cell-progress';
    cell.className = `word-cell ${cls}`;
    cell.textContent = w.es;
    cell.title = `${w.es} — ${w.he} (${cc}/${MASTERY_TARGET})`;
    frag.appendChild(cell);
  });
  els.statsGrid.appendChild(frag);
}

// ---- Screen management ----
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  if (name === 'home') refreshHomeStats();
}

// ---- DOM wiring ----
const els = {};
function cacheEls() {
  [
    'homeMastered', 'homeInProgress', 'homeUnlocked', 'homeProgressFill',
    'startSessionBtn', 'resetBtn', 'statsBtn', 'statsModal', 'closeStats', 'statsGrid',
    'exitSessionBtn', 'sessionProgressFill', 'sessionDone', 'sessionTotal', 'streakBadge',
    'flashcard', 'wordEs', 'wordHe', 'cardMastery', 'answerButtons', 'btnWrong', 'btnCorrect',
    'doneCorrectFirst', 'doneMasteredNow', 'nextSessionBtn', 'backHomeBtn', 'speakBtn',
  ].forEach(id => { els[id] = document.getElementById(id); });
}

function wireEvents() {
  els.startSessionBtn.addEventListener('click', startSession);
  els.nextSessionBtn.addEventListener('click', startSession);
  els.backHomeBtn.addEventListener('click', () => showScreen('home'));
  els.exitSessionBtn.addEventListener('click', () => {
    if (confirm('לצאת מהסשן? ההתקדמות שנשמרה עד כה תישאר.')) showScreen('home');
  });

  els.flashcard.addEventListener('click', revealCard);
  els.speakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (session && session.currentId != null) speakSpanish(session.byId[session.currentId].es);
  });

  els.btnWrong.addEventListener('click', (e) => { e.stopPropagation(); if (session.revealed) answerWrong(); });
  els.btnCorrect.addEventListener('click', (e) => { e.stopPropagation(); if (session.revealed) answerCorrect(); });

  els.statsBtn.addEventListener('click', () => { renderStatsGrid(); els.statsModal.classList.add('show'); });
  els.closeStats.addEventListener('click', () => els.statsModal.classList.remove('show'));
  els.statsModal.addEventListener('click', (e) => { if (e.target === els.statsModal) els.statsModal.classList.remove('show'); });

  els.resetBtn.addEventListener('click', () => {
    if (confirm('לאפס את כל ההתקדמות ב-500 המילים?')) {
      state = { progress: {}, unlockedCount: INITIAL_UNLOCK, sessionsCompleted: 0 };
      saveState();
      refreshHomeStats();
    }
  });
}

function init() {
  cacheEls();
  wireEvents();
  showScreen('home');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
