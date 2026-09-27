// Spanish -> Hebrew flashcard learning app.
// Persists progress in localStorage and drives one 15-word session at a time.

const STORAGE_KEY = 'esHeFlashcards_v1';
const MASTERY_TARGET = 5; // times a word must be answered correctly (total) before it's "known"
const SESSION_SIZE = 15;
const REQUEUE_GAP = 2; // wrong answers reappear after this many other cards
const INITIAL_UNLOCK_WORDS = 20;
const INITIAL_UNLOCK_PHRASES = 15;

// ---- UI text (interface chrome only - learning content is never translated) ----
const UI_STRINGS = {
  he: {
    docTitle: 'קלפי ספרדית - למידת 500 מילים',
    brand: '🇪🇸 ➜ 🇮🇱 קלפי ספרדית',
    homeTitle: 'ברוכים הבאים!',
    homeIntro: 'למדו 500 המילים החשובות בספרדית או בעברית, קלף אחרי קלף.',
    dirEs2He: '🇪🇸 ➜ 🇮🇱 לימוד ספרדית',
    dirHe2Es: '🇮🇱 ➜ 🇪🇸 לימוד עברית',
    typeWords: 'מילים בודדות',
    typePhrases: 'ביטויי שיחה',
    statMastered: 'ידוע/ות',
    statInProgress: 'בתהליך לימוד',
    statUnlocked: 'נפתח/ו',
    resetBtn: 'איפוס התקדמות',
    resetConfirm: 'לאפס את כל ההתקדמות?',
    statsBtnAria: 'סטטיסטיקה',
    langBtnAria: 'שינוי שפת התצוגה',
    exitAria: 'יציאה',
    exitConfirm: 'לצאת מהסשן? ההתקדמות שנשמרה עד כה תישאר.',
    speakAria: 'השמע הגייה',
    tapHint: 'הקש כדי לראות את התרגום 👆',
    sessionDoneLabel: 'הושלמו',
    btnWrong: '❌ טעיתי',
    btnCorrect: '✅ ידעתי!',
    completeTitle: 'כל הכבוד!',
    doneCorrectLabel: 'נכון בפעם הראשונה',
    nextSessionBtn: 'סשן נוסף',
    backHomeBtn: 'חזרה למסך הבית',
    statsTitle: 'ההתקדמות שלי',
    legendMastered: 'ידוע (5/5)',
    legendProgress: 'בתהליך',
    legendLocked: 'טרם נפתח',
    closeAria: 'סגור',
  },
  en: {
    docTitle: 'Spanish Flashcards - Learn 500 Words',
    brand: '🇪🇸 ➜ 🇮🇱 Spanish Flashcards',
    homeTitle: 'Welcome!',
    homeIntro: 'Learn the 500 most important Spanish words, in Spanish or Hebrew, card by card.',
    dirEs2He: '🇪🇸 ➜ 🇮🇱 Learn Spanish',
    dirHe2Es: '🇮🇱 ➜ 🇪🇸 Learn Hebrew',
    typeWords: 'Single words',
    typePhrases: 'Conversation phrases',
    statMastered: 'Mastered',
    statInProgress: 'In progress',
    statUnlocked: 'Unlocked',
    resetBtn: 'Reset progress',
    resetConfirm: 'Reset all progress?',
    statsBtnAria: 'Statistics',
    langBtnAria: 'Change display language',
    exitAria: 'Exit',
    exitConfirm: 'Exit the session? Progress saved so far will stay.',
    speakAria: 'Play pronunciation',
    tapHint: 'Tap to see the translation 👆',
    sessionDoneLabel: 'done',
    btnWrong: "❌ Didn't know",
    btnCorrect: '✅ Knew it!',
    completeTitle: 'Well done!',
    doneCorrectLabel: 'Correct on first try',
    nextSessionBtn: 'Another session',
    backHomeBtn: 'Back to home',
    statsTitle: 'My progress',
    legendMastered: 'Known (5/5)',
    legendProgress: 'In progress',
    legendLocked: 'Not unlocked yet',
    closeAria: 'Close',
  },
};

function activeSet() {
  return state.contentType === 'phrases' ? PHRASES : WORDS;
}

// Small runtime-composed strings that depend on the current direction/content
// type/counts, kept separate from the flat UI_STRINGS swap above.
function startSessionText() {
  const isEs2He = state.direction !== 'he2es';
  const isPhrases = state.contentType === 'phrases';
  if (state.uiLang === 'en') {
    const dir = isEs2He ? 'Spanish' : 'Hebrew';
    const items = isPhrases ? 'phrases' : 'words';
    return `Start ${dir} session (${SESSION_SIZE} ${items})`;
  }
  const dir = isEs2He ? 'ספרדית' : 'עברית';
  const items = isPhrases ? 'ביטויים' : 'מילים';
  return `התחל סשן לימוד ${dir} (${SESSION_SIZE} ${items})`;
}

function completeSubText() {
  const isPhrases = state.contentType === 'phrases';
  if (state.uiLang === 'en') {
    return `You finished a session of ${SESSION_SIZE} ${isPhrases ? 'phrases' : 'words'}.`;
  }
  return `סיימת סשן לימוד של ${SESSION_SIZE} ${isPhrases ? 'ביטויים' : 'מילים'}.`;
}

function doneMasteredLabelText() {
  const isPhrases = state.contentType === 'phrases';
  if (state.uiLang === 'en') {
    return `New ${isPhrases ? 'phrases' : 'words'} fully learned`;
  }
  return `${isPhrases ? 'ביטויים' : 'מילים'} חדשים שנלמדו לגמרי`;
}

function progressLabelText(cc) {
  return state.uiLang === 'en' ? `Progress: ${cc}/${MASTERY_TARGET}` : `התקדמות: ${cc}/${MASTERY_TARGET}`;
}

// ---- Pronunciation (Web Speech API, female voice preferred) ----
// Supports both directions: Spanish (es) and Hebrew (he).
const cachedVoices = { es: null, he: null };
const FALLBACK_LANG = { es: 'es-ES', he: 'he-IL' };

function pickVoiceFor(langPrefix) {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  const matches = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix));
  if (!matches.length) return null;
  const femaleHints = ['female', 'mujer', 'woman', 'monica', 'mónica', 'paulina', 'lucia', 'lucía', 'esperanza', 'elena', 'conchita', 'camila', 'carmit', 'sivan', 'noa'];
  const female = matches.find(v => femaleHints.some(hint => v.name.toLowerCase().includes(hint)));
  return female || matches[0];
}

function refreshVoices() {
  const es = pickVoiceFor('es');
  if (es) cachedVoices.es = es;
  const he = pickVoiceFor('he');
  if (he) cachedVoices.he = he;
}

if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function speakWord(text, langPrefix) {
  if (!('speechSynthesis' in window) || !text) return;
  // Must run synchronously inside the user-gesture call stack (click/tap) -
  // Android Chrome silently blocks speech that's deferred via setTimeout or
  // any other async hop. speechSynthesis.cancel() is deliberately never
  // called here - on some Android devices it hangs the page when invoked
  // back-to-back with speak(), which is what broke advancing between cards.
  // speak() queues on its own, so skipping cancel() just means a still-
  // playing word finishes before the next one starts.
  try {
    const voice = cachedVoices[langPrefix];
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = voice ? voice.lang : FALLBACK_LANG[langPrefix];
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.pitch = 1.1;
    speechSynthesis.speak(utter);
  } catch (e) {
    /* ignore - pronunciation is a nice-to-have, never block the app */
  }
}

function defaultState() {
  return {
    progress: {},
    unlockedCount: { words: INITIAL_UNLOCK_WORDS, phrases: INITIAL_UNLOCK_PHRASES },
    sessionsCompleted: 0,
    direction: 'es2he',
    contentType: 'words',
    uiLang: 'he',
  };
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.progress) {
        if (parsed.direction !== 'es2he' && parsed.direction !== 'he2es') parsed.direction = 'es2he';
        if (parsed.contentType !== 'words' && parsed.contentType !== 'phrases') parsed.contentType = 'words';
        if (parsed.uiLang !== 'he' && parsed.uiLang !== 'en') parsed.uiLang = 'he';
        if (typeof parsed.unlockedCount === 'number') {
          // Migrate from the old single-number shape (words-only).
          parsed.unlockedCount = { words: parsed.unlockedCount, phrases: INITIAL_UNLOCK_PHRASES };
        } else if (!parsed.unlockedCount || typeof parsed.unlockedCount !== 'object') {
          parsed.unlockedCount = { words: INITIAL_UNLOCK_WORDS, phrases: INITIAL_UNLOCK_PHRASES };
        } else {
          if (typeof parsed.unlockedCount.words !== 'number') parsed.unlockedCount.words = INITIAL_UNLOCK_WORDS;
          if (typeof parsed.unlockedCount.phrases !== 'number') parsed.unlockedCount.phrases = INITIAL_UNLOCK_PHRASES;
        }
        return parsed;
      }
    } catch (e) { /* fall through to default */ }
  }
  return defaultState();
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
  // Make sure there are at least SESSION_SIZE unmastered items available;
  // otherwise open up more of the (harder) list.
  const set = activeSet();
  const type = state.contentType;
  let unlocked = set.filter(w => w.rank <= state.unlockedCount[type]);
  let unmastered = unlocked.filter(w => !isMastered(w.id));
  while (unmastered.length < SESSION_SIZE && state.unlockedCount[type] < set.length) {
    state.unlockedCount[type] = Math.min(set.length, state.unlockedCount[type] + 10);
    unlocked = set.filter(w => w.rank <= state.unlockedCount[type]);
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
  const set = activeSet();
  const type = state.contentType;
  const unlocked = set.filter(w => w.rank <= state.unlockedCount[type]);
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
    // Not enough unmastered items unlocked (edge case near full mastery) -
    // top up with any remaining unmastered items, then mastered ones as review practice.
    const usedIds = new Set(session.map(w => w.id));
    const leftoverUnmastered = unmastered.filter(w => !usedIds.has(w.id));
    session = session.concat(shuffle(leftoverUnmastered).slice(0, remaining));
    remaining = SESSION_SIZE - session.length;
  }
  if (remaining > 0) {
    const usedIds = new Set(session.map(w => w.id));
    const masteredItems = set.filter(w => !usedIds.has(w.id) && w.rank <= state.unlockedCount[type]);
    session = session.concat(shuffle(masteredItems).slice(0, remaining));
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

  const isEs2He = state.direction !== 'he2es';
  const frontText = isEs2He ? word.es : word.he;
  const backText = isEs2He ? word.he : word.es;
  const frontLang = isEs2He ? 'es' : 'he';

  els.wordFront.textContent = frontText;
  els.wordFront.style.direction = isEs2He ? 'ltr' : 'rtl';
  els.wordBack.textContent = backText;
  els.wordBack.style.direction = isEs2He ? 'rtl' : 'ltr';
  els.cardTagFront.textContent = frontLang.toUpperCase();
  els.cardTagBack.textContent = (isEs2He ? 'he' : 'es').toUpperCase();

  requestAnimationFrame(() => {
    els.flashcard.classList.remove('no-transition');
  });
  speakWord(frontText, frontLang);

  const cc = getCorrectCount(word.id);
  els.cardMastery.textContent = progressLabelText(cc);
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
  const type = state.contentType;
  state.unlockedCount[type] = Math.min(activeSet().length, state.unlockedCount[type] + bonus);
  saveState();

  els.doneCorrectFirst.textContent = session.firstTryCorrect;
  els.doneMasteredNow.textContent = session.masteredNow;
  els.completeSub.textContent = completeSubText();
  els.doneMasteredLabel.textContent = doneMasteredLabelText();
  showScreen('complete');
}

// ---- Home / stats rendering ----
function refreshHomeStats() {
  const set = activeSet();
  const type = state.contentType;
  const mastered = set.filter(w => isMastered(w.id)).length;
  const inProgress = set.filter(w => !isMastered(w.id) && getCorrectCount(w.id) > 0).length;
  els.homeMastered.textContent = mastered;
  els.homeInProgress.textContent = inProgress;
  els.homeUnlocked.textContent = Math.min(state.unlockedCount[type], set.length);
  els.homeProgressFill.style.width = `${(mastered / set.length) * 100}%`;
}

function renderStatsGrid() {
  els.statsGrid.innerHTML = '';
  const frag = document.createDocumentFragment();
  const set = activeSet();
  const type = state.contentType;
  set.forEach(w => {
    const cell = document.createElement('div');
    const cc = getCorrectCount(w.id);
    let cls = 'cell-locked';
    if (isMastered(w.id)) cls = 'cell-mastered';
    else if (cc > 0) cls = 'cell-progress';
    else if (w.rank <= state.unlockedCount[type]) cls = 'cell-progress';
    cell.className = `word-cell ${cls}`;
    cell.textContent = w.es;
    cell.title = `${w.es} — ${w.he} (${cc}/${MASTERY_TARGET})`;
    cell.dataset.showing = 'es';
    cell.addEventListener('click', () => {
      const showingHe = cell.dataset.showing === 'es';
      cell.dataset.showing = showingHe ? 'he' : 'es';
      cell.textContent = showingHe ? w.he : w.es;
      cell.classList.toggle('cell-flipped', showingHe);
    });
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
    'flashcard', 'wordFront', 'wordBack', 'cardTagFront', 'cardTagBack', 'cardMastery',
    'answerButtons', 'btnWrong', 'btnCorrect',
    'doneCorrectFirst', 'doneMasteredNow', 'nextSessionBtn', 'backHomeBtn', 'speakBtn',
    'dirEs2He', 'dirHe2Es', 'typeWords', 'typePhrases', 'langBtn',
    'brandText', 'homeTitle', 'homeIntro', 'statLabelMastered', 'statLabelInProgress',
    'statLabelUnlocked', 'tapHint', 'sessionDoneLabel', 'completeTitle', 'completeSub',
    'doneCorrectLabel', 'doneMasteredLabel', 'statsTitle', 'legendMastered', 'legendProgress',
    'legendLocked',
  ].forEach(id => { els[id] = document.getElementById(id); });
}

function wireEvents() {
  els.startSessionBtn.addEventListener('click', startSession);
  els.nextSessionBtn.addEventListener('click', startSession);
  els.backHomeBtn.addEventListener('click', () => showScreen('home'));
  els.exitSessionBtn.addEventListener('click', () => {
    if (confirm(UI_STRINGS[state.uiLang].exitConfirm)) showScreen('home');
  });

  els.flashcard.addEventListener('click', revealCard);
  els.speakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (session && session.currentId != null) {
      const word = session.byId[session.currentId];
      const isEs2He = state.direction !== 'he2es';
      speakWord(isEs2He ? word.es : word.he, isEs2He ? 'es' : 'he');
    }
  });

  els.btnWrong.addEventListener('click', (e) => { e.stopPropagation(); if (session.revealed) answerWrong(); });
  els.btnCorrect.addEventListener('click', (e) => { e.stopPropagation(); if (session.revealed) answerCorrect(); });

  els.statsBtn.addEventListener('click', () => { renderStatsGrid(); els.statsModal.classList.add('show'); });
  els.closeStats.addEventListener('click', () => els.statsModal.classList.remove('show'));
  els.statsModal.addEventListener('click', (e) => { if (e.target === els.statsModal) els.statsModal.classList.remove('show'); });

  els.dirEs2He.addEventListener('click', () => setDirection('es2he'));
  els.dirHe2Es.addEventListener('click', () => setDirection('he2es'));
  els.typeWords.addEventListener('click', () => setContentType('words'));
  els.typePhrases.addEventListener('click', () => setContentType('phrases'));
  els.langBtn.addEventListener('click', () => applyUILang(state.uiLang === 'he' ? 'en' : 'he'));

  els.resetBtn.addEventListener('click', () => {
    if (confirm(UI_STRINGS[state.uiLang].resetConfirm)) {
      const kept = { direction: state.direction, contentType: state.contentType, uiLang: state.uiLang };
      state = Object.assign(defaultState(), kept);
      saveState();
      refreshHomeStats();
    }
  });
}

function setDirection(dir) {
  state.direction = dir;
  saveState();
  els.dirEs2He.classList.toggle('active', dir === 'es2he');
  els.dirHe2Es.classList.toggle('active', dir === 'he2es');
  els.startSessionBtn.textContent = startSessionText();
}

function setContentType(type) {
  state.contentType = type;
  saveState();
  els.typeWords.classList.toggle('active', type === 'words');
  els.typePhrases.classList.toggle('active', type === 'phrases');
  els.startSessionBtn.textContent = startSessionText();
  refreshHomeStats();
}

function applyUILang(lang) {
  state.uiLang = lang;
  saveState();
  const s = UI_STRINGS[lang];
  const textDir = lang === 'en' ? 'ltr' : 'rtl';
  // Set text + per-element dir together: English chrome text sitting inside
  // an RTL-directioned element gets its punctuation reordered by the bidi
  // algorithm (e.g. "!Welcome" instead of "Welcome!"), so every swapped
  // chrome string needs its own explicit direction, independent of the
  // page's overall RTL layout (which stays fixed either way).
  function setText(el, text) {
    el.textContent = text;
    el.dir = textDir;
  }

  document.title = s.docTitle;
  document.documentElement.lang = lang;
  setText(els.brandText, s.brand);
  setText(els.homeTitle, s.homeTitle);
  setText(els.homeIntro, s.homeIntro);
  setText(els.dirEs2He, s.dirEs2He);
  setText(els.dirHe2Es, s.dirHe2Es);
  setText(els.typeWords, s.typeWords);
  setText(els.typePhrases, s.typePhrases);
  setText(els.statLabelMastered, s.statMastered);
  setText(els.statLabelInProgress, s.statInProgress);
  setText(els.statLabelUnlocked, s.statUnlocked);
  setText(els.resetBtn, s.resetBtn);
  els.statsBtn.setAttribute('aria-label', s.statsBtnAria);
  els.langBtn.setAttribute('aria-label', s.langBtnAria);
  els.langBtn.textContent = lang === 'he' ? '🌐 EN' : '🌐 עב';
  els.exitSessionBtn.setAttribute('aria-label', s.exitAria);
  els.speakBtn.setAttribute('aria-label', s.speakAria);
  setText(els.tapHint, s.tapHint);
  setText(els.sessionDoneLabel, s.sessionDoneLabel);
  setText(els.btnWrong, s.btnWrong);
  setText(els.btnCorrect, s.btnCorrect);
  setText(els.completeTitle, s.completeTitle);
  setText(els.doneCorrectLabel, s.doneCorrectLabel);
  setText(els.nextSessionBtn, s.nextSessionBtn);
  setText(els.backHomeBtn, s.backHomeBtn);
  setText(els.statsTitle, s.statsTitle);
  setText(els.legendMastered, s.legendMastered);
  setText(els.legendProgress, s.legendProgress);
  setText(els.legendLocked, s.legendLocked);
  els.closeStats.setAttribute('aria-label', s.closeAria);

  // Refresh runtime-composed strings in case they're currently visible.
  setText(els.startSessionBtn, startSessionText());
  setText(els.completeSub, completeSubText());
  setText(els.doneMasteredLabel, doneMasteredLabelText());
  if (session && session.currentId != null) {
    setText(els.cardMastery, progressLabelText(getCorrectCount(session.currentId)));
  }
}

function init() {
  cacheEls();
  wireEvents();
  applyUILang(state.uiLang);
  setDirection(state.direction);
  setContentType(state.contentType);
  showScreen('home');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
