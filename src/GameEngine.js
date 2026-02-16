// GameEngine.js
// Core, engine-agnostic game logic for an 8x5 board.
// Board is an array of rows, each row is an array of cols.
// row 0 = top, row rows-1 = bottom.

const DEFAULT_ROWS = 8;
const DEFAULT_COLS = 5;
const MIN_WORD_LEN = 4;

// Simple test dictionary - replace this with a larger set later.
const SAMPLE_DICT = new Set([
  "WORD","TEST","READ","NOTE","PLAY","DROP","GRID","FALL","FIRE","TIME","LINE","TILE","GAME","SAND"
]);

// Simple letter scores (Scrabble-like small subset)
const LETTER_SCORES = Object.assign(
  {},
  ..."AEIOULNSTR".split("").map(l => ({[l]:1})),
  ..."DG".split("").map(l => ({[l]:2})),
  ..."BCMP".split("").map(l => ({[l]:3})),
  ..."FHVWY".split("").map(l => ({[l]:4})),
  {"K":5, "J":8, "X":8, "Q":10, "Z":10}
);

// Basic tile distribution (small, tweak as needed)
const DEFAULT_DISTRIBUTION = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1, L:4,
  M:2, N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1
};

export function createBoard(rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  return Array.from({length: rows}, () => Array(cols).fill(null));
}

export function makeTileBag(dist = DEFAULT_DISTRIBUTION) {
  const bag = [];
  for (const [letter, count] of Object.entries(dist)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  shuffle(bag);
  return bag;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function drawTile(bag) {
  if (!bag.length) return null;
  return bag.pop();
}

// Place tile in column. Returns an object { board, placedRow, nextBag, gameOver, reason }
export function placeTile(board, col, tile, bag) {
  const rows = board.length;
  // find lowest empty row in column (scan bottom-up)
  for (let r = rows - 1; r >= 0; r--) {
    if (!board[r][col]) {
      const newBoard = board.map(row => row.slice());
      newBoard[r][col] = tile;
      return { board: newBoard, placedRow: r, nextBag: bag, gameOver: false };
    }
  }
  // No empty cell — placing would be above board -> immediate game over
  return { board, placedRow: null, nextBag: bag, gameOver: true, reason: "column full" };
}

// Apply gravity (drop letters down to fill nulls). Returns new board.
export function applyGravity(board) {
  const rows = board.length, cols = board[0].length;
  const out = createBoard(rows, cols);
  for (let c = 0; c < cols; c++) {
    let writeRow = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r][c]) {
        out[writeRow][c] = board[r][c];
        writeRow--;
      }
    }
    // remaining cells are null (already)
  }
  return out;
}

// Find all words on the board (4 directions): right, down, down-right, up-right
// Returns { words: [{ positions: [[r,c],...], text }], boardPositionsMarked: Set-of-positions }
export function findAllWords(board, dict = SAMPLE_DICT, minLen = MIN_WORD_LEN) {
  const rows = board.length, cols = board[0].length;
  const found = [];
  const marked = new Set();

  const dirs = [
    {dr: 0, dc: 1},   // right
    {dr: 1, dc: 0},   // down
    {dr: 1, dc: 1},   // down-right (\)
    {dr: -1, dc: 1}   // up-right (/)
  ];

  function inBounds(r,c){ return r>=0 && r<rows && c>=0 && c<cols; }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!board[r][c]) continue;
      for (const d of dirs) {
        // To avoid duplicate detection, ensure previous cell in opposite direction is empty/out-of-bounds
        const prevR = r - d.dr, prevC = c - d.dc;
        if (inBounds(prevR, prevC) && board[prevR][prevC]) continue;

        let rr = r, cc = c, letters = "", positions = [];
        while (inBounds(rr, cc) && board[rr][cc]) {
          letters += board[rr][cc];
          positions.push([rr,cc]);
          if (letters.length >= minLen) {
            // Check if this substring is a word
            if (dict.has(letters)) {
              // record word positions
              found.push({ text: letters, positions: positions.slice() });
              positions.forEach(p => marked.add(`${p[0]}:${p[1]}`));
            }
          }
          rr += d.dr; cc += d.dc;
        }
      }
    }
  }

  return { words: found, markedPositions: marked }; 
}

// Remove marked positions and return new board + score of removal
export function removeMarked(board, markedPositions, scoring = LETTER_SCORES) {
  const rows = board.length, cols = board[0].length;
  let score = 0;
  const newBoard = board.map(row => row.slice());
  for (const posStr of markedPositions) {
    const [r,s] = posStr.split(":").map(Number);
    const letter = newBoard[r][s];
    if (!letter) continue;
    score += (scoring[letter] || 1);
    newBoard[r][s] = null;
  }
  // optional: apply length multiplier? keep simple: score = sum(letter scores)
  const gravityBoard = applyGravity(newBoard);
  return { board: gravityBoard, score };
}
