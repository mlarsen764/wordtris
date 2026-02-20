import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as GE from './GameEngine.js';
const {
  makeTileBag, drawTile, placeTile, createBoard, findAllWords,
  removeMarkedWithWords, applyGravity, Bag
} = GE;

/**
 * Deterministic tests for bag reshuffling and core engine behavior.
 *
 * We mock Math.random only (not the whole Math object) so Math.floor etc remain functional.
 */

// deterministic Math.random for shuffle
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.12345);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: draw a tile, and if bag empty, recreate it from dist and draw again.
// Returns { tile, bag } with tile guaranteed non-null (assuming dist non-empty).
function drawOrReshuffle(bag, dist) {
  let t = drawTile(bag);
  if (t == null) {
    bag = makeTileBag(dist);
    t = drawTile(bag);
  }
  return { tile: t, bag };
}

describe('Bag Abstraction', () => {
  it('creates bag and draws tiles', () => {
    const bag = new Bag({ A: 2, B: 2 });
    expect(bag.remaining()).toBe(4);
    expect(bag.refillCount).toBe(1);
    
    const t1 = bag.draw();
    expect(t1).not.toBeNull();
    expect(bag.remaining()).toBe(3);
  });

  it('automatically refills when empty', () => {
    const bag = new Bag({ X: 2 });
    expect(bag.refillCount).toBe(1);
    
    bag.draw();
    bag.draw();
    expect(bag.remaining()).toBe(0);
    
    const t3 = bag.draw();
    expect(t3).not.toBeNull();
    expect(bag.refillCount).toBe(2);
    expect(bag.remaining()).toBe(1);
  });

  it('never returns null from draw', () => {
    const bag = new Bag({ A: 1, B: 1 });
    
    for (let i = 0; i < 50; i++) {
      const tile = bag.draw();
      expect(tile).not.toBeNull();
    }
    
    expect(bag.refillCount).toBeGreaterThan(1);
  });

  it('can spy on _refill method', () => {
    const bag = new Bag({ Y: 2 });
    const spy = vi.spyOn(bag, '_refill');
    
    bag.draw();
    bag.draw();
    bag.draw(); // triggers refill
    
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Tile Bag Reshuffling - Indefinite Gameplay', () => {
  it('counts bag refills using spy', () => {
    const spy = vi.spyOn(GE, 'makeTileBag');
    const smallDist = { A: 2, B: 2 };
    
    let bag = makeTileBag(smallDist);
    let refillCount = 1; // initial bag
    
    // Draw 10 tiles, refilling as needed
    for (let i = 0; i < 10; i++) {
      let tile = drawTile(bag);
      if (!tile) {
        bag = makeTileBag(smallDist);
        refillCount++;
        tile = drawTile(bag);
      }
    }
    
    expect(spy).toHaveBeenCalledTimes(refillCount);
    expect(refillCount).toBeGreaterThanOrEqual(3);
    spy.mockRestore();
  });

  it('reshuffles and refills bag when emptied manually', () => {
    const smallDist = { A: 2, B: 2, C: 2 };
    let bag = makeTileBag(smallDist);
    const initialBagSize = bag.length;

    // empty the bag
    while (bag.length > 0) drawTile(bag);
    expect(bag.length).toBe(0);

    // manual refill (simulates app/engine behavior)
    bag = makeTileBag(smallDist);
    expect(bag.length).toBe(initialBagSize);
    expect(drawTile(bag)).not.toBeNull();
  });

  it('allows continuous tile drawing across multiple bag cycles', () => {
    const smallDist = { A: 1, B: 1 };
    let bag = makeTileBag(smallDist);
    const draws = [];

    // simulate 5 cycles of empty -> refill -> empty -> refill
    for (let cycle = 0; cycle < 5; cycle++) {
      while (bag.length > 0) {
        const t = drawTile(bag);
        draws.push(t);
      }
      bag = makeTileBag(smallDist);
    }

    expect(draws.length).toBe(10); // 2 tiles * 5 cycles
    expect(draws.every(t => t != null)).toBe(true);
  });

  it('simulates continuous play with automatic reshuffle until game over (or safety cap)', () => {
    const dist = { A: 2, B: 2 }; // small bag to force frequent reshuffles
    let bag = makeTileBag(dist);
    let board = createBoard(8, 5);
    let steps = 0;
    const maxSteps = 500; // safety cap
    let sawGameOver = false;

    // continue drawing/placing round-robin across columns until game over or cap reached
    while (steps < maxSteps) {
      const col = steps % 5;
      const resDraw = drawOrReshuffle(bag, dist);
      bag = resDraw.bag;
      const tile = resDraw.tile;

      const res = placeTile(board, col, tile, bag);
      board = res.board;
      if (res.gameOver) {
        sawGameOver = true;
        break;
      }

      // simulate occasional clears with a tiny test dictionary so state changes occur
      const found = findAllWords(board, new Set(['AAAA', 'AA']));
      if (found.markedPositions && found.markedPositions.size > 0) {
        const removed = removeMarkedWithWords(board, found.words);
        board = removed.board;
      }

      steps++;
    }

    // Expect we either reached game over within the safety cap or we hit the cap
    expect(steps < maxSteps || sawGameOver).toBe(true);
  });

  it('never returns null from draw when using drawOrReshuffle helper', () => {
    const dist = { X: 1, Y: 1 };
    let bag = makeTileBag(dist);

    for (let i = 0; i < 100; i++) {
      const res = drawOrReshuffle(bag, dist);
      bag = res.bag;
      expect(res.tile).not.toBeNull();
    }
  });

  it('works when combined with word clearing and refilling', () => {
    const dict = new Set(['ABCD', 'AAAA']);
    let bag = makeTileBag({ A: 4, B: 1, C: 1, D: 1 });
    let board = createBoard(8, 5);

    board[7][0] = 'A';
    board[7][1] = 'B';
    board[7][2] = 'C';
    board[7][3] = 'D';

    const found = findAllWords(board, dict);
    expect(found.words.length).toBeGreaterThan(0);

    const { board: clearedBoard } = removeMarkedWithWords(board, found.words);

    // empty the bag then reshuffle
    while (bag.length > 0) drawTile(bag);
    expect(bag.length).toBe(0);

    bag = makeTileBag({ A: 4, B: 1, C: 1, D: 1 });
    expect(bag.length).toBe(7);

    const { tile: t2, bag: bag2 } = drawOrReshuffle(bag, { A: 4, B: 1, C: 1, D: 1 });
    bag = bag2;
    const res = placeTile(clearedBoard, 0, t2, bag);
    expect(res.gameOver).toBe(false);
  });
});

describe('GameEngine - Core Functionality', () => {
  it('creates an empty board with correct dimensions', () => {
    const b = createBoard(8, 5);
    expect(b.length).toBe(8);
    expect(b[0].length).toBe(5);
    expect(b[0][0]).toBeNull();
  });

  it('creates tile bag with correct distribution counts', () => {
    const dist = { A: 3, B: 2 };
    const bag = makeTileBag(dist);
    expect(bag.length).toBe(5);
    expect(bag.filter(t => t === 'A').length).toBe(3);
    expect(bag.filter(t => t === 'B').length).toBe(2);
  });

  it('places tile in lowest available row', () => {
    const b = createBoard(8, 5);
    const result = placeTile(b, 0, 'A', []);
    expect(result.placedRow).toBe(7);
    expect(result.board[7][0]).toBe('A');
  });

  it('detects game over when a column is full', () => {
    const b = createBoard(8, 5);
    for (let r = 0; r < 8; r++) b[r][0] = 'A';
    const result = placeTile(b, 0, 'B', []);
    expect(result.gameOver).toBe(true);
    expect(result.reason).toBe('column full');
  });

  it('applies gravity correctly', () => {
    const b = createBoard(8, 5);
    b[5][0] = 'A';
    b[3][0] = 'B';
    b[1][0] = 'C';

    const out = applyGravity(b);
    expect(out[7][0]).toBe('A');
    expect(out[6][0]).toBe('B');
    expect(out[5][0]).toBe('C');
    expect(out[4][0]).toBeNull();
  });
});