// Symbol pool (animals + everyday objects) and the 4 progressive stages.
// Board sizes are kept even so every card always has a matching pair;
// the classic "3x3" / "5x5" sizes are swapped for the nearest even boards.
const SYMBOLS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁',
  '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '⭐', '🌙', '⚽', '🎈',
];

const STAGES = [
  { level: 1, rows: 2, cols: 3, label: '2 × 3' },
  { level: 2, rows: 4, cols: 4, label: '4 × 4' },
  { level: 3, rows: 4, cols: 6, label: '4 × 6' },
  { level: 4, rows: 6, cols: 6, label: '6 × 6' },
];
