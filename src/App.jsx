import React, { useState, useEffect, useRef } from "react";
import {
  createBoard, makeTileBag, drawTile, placeTile,
  findAllWords, removeMarkedWithWords
} from "./GameEngine";
import { loadWordSet } from "./Dictionary";
import "./index.css";

const ROWS = 8, COLS = 5;
const MIN_WORD_LEN = 4; // change here if you want 3+

function Cell({ val, animState }) {
  return <div className={"cell " + (val ? "filled " : "") + (animState || "")}>{val || ""}</div>;
}

export default function App() {
  const [board, setBoard] = useState(() => createBoard(ROWS, COLS));
  const [bag, setBag] = useState(() => makeTileBag());
  const [current, setCurrent] = useState(null);
  const [next, setNext] = useState(null);
  const [score, setScore] = useState(0);
  const [foundWords, setFoundWords] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("");
  const [animStates, setAnimStates] = useState(() => createBoard(ROWS, COLS));
  const [isAnimating, setIsAnimating] = useState(false);

  const [wordSet, setWordSet] = useState(null);
  const [loadingDict, setLoadingDict] = useState(true);
  const [dictError, setDictError] = useState(null);

  const mountedRef = useRef(true);
  const timeoutsRef = useRef([]);
  
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const setSafeTimeout = (fn, delay) => {
    const id = setTimeout(() => {
      if (mountedRef.current) {
        fn();
        timeoutsRef.current = timeoutsRef.current.filter(i => i !== id);
      }
    }, delay);
    timeoutsRef.current.push(id);
    return id;
  };

  // initialize bag & first tiles
  useEffect(() => {
    const b = makeTileBag();
    const c = drawTile(b);
    const n = drawTile(b);
    setBag(b);
    setCurrent(c);
    setNext(n);
  }, []);

  // load dictionary on start
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingDict(true);
      try {
        const set = await loadWordSet("/words.txt", { minLen: MIN_WORD_LEN });
        if (!mounted) return;
        setWordSet(set);
        setDictError(null);
        console.log("Loaded dictionary size:", set.size);
        console.log("RAMS in dict?", set.has("RAMS"));
      } catch (err) {
        console.error("Dictionary load failed:", err);
        if (!mounted) return;
        setDictError(err.message || String(err));
      } finally {
        if (!mounted) return;
        setLoadingDict(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function drawFromBag(localBag, promotedNext) {
    const refill = () => makeTileBag();
    
    let newCurrent = promotedNext ?? drawTile(localBag);
    if (!newCurrent) {
      localBag = refill();
      newCurrent = drawTile(localBag);
    }
    
    let newNext = drawTile(localBag);
    if (!newNext) {
      localBag = refill();
      newNext = drawTile(localBag);
    }
    
    return { localBag, newCurrent, newNext };
  }

  function handleColumnClick(col) {
    console.log('Click - isAnimating:', isAnimating, 'gameOver:', gameOver, 'current:', current);
    if (gameOver) return;
    if (loadingDict) {
      setMessage("Please wait — dictionary still loading.");
      return;
    }
    if (dictError) {
      setMessage("Dictionary failed to load. See console.");
      return;
    }
    if (!current) {
      setMessage("No tile to place");
      console.log('No current tile!');
      return;
    }

    const res = placeTile(board, col, current, bag);
    if (res.gameOver) {
      setGameOver(true);
      setMessage("Game Over — column full!");
      return;
    }
    let newBoard = res.board;

    // Animate the newly placed tile
    const placeAnims = createBoard(ROWS, COLS);
    placeAnims[res.placedRow][col] = 'placing';
    setBoard(newBoard);
    setAnimStates(placeAnims);

    // draw next tile synchronously from a local bag (avoid stale closures)
    const { localBag: afterBag, newCurrent, newNext } = drawFromBag(bag.slice(), next);
    setBag(afterBag);
    setCurrent(newCurrent);
    setNext(newNext);
    
    console.log('After draw - current:', newCurrent, 'next:', newNext, 'bag size:', afterBag.length);

    // Clear placing animation after it completes
    setTimeout(() => {
      if (!mountedRef.current) return;
      setAnimStates(createBoard(ROWS, COLS));
    }, 250);

    // find words using the loaded dictionary (guarded)
    const found = wordSet ? findAllWords(newBoard, wordSet, MIN_WORD_LEN) : { words: [], markedPositions: new Set() };

    // If words found, remove them immediately
    if (found.markedPositions && found.markedPositions.size > 0) {
      const { board: after, score: delta } = removeMarkedWithWords(newBoard, found.words);
      
      setBoard(after);
      setScore(s => s + delta);
      setFoundWords(prev => [...found.words.map(w => w.text), ...prev].slice(0, 100));
      setMessage(`Cleared ${found.markedPositions.size} letters from ${found.words.length} words`);
    } else {
      setMessage("");
    }
  }

  function handleReset() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setBoard(createBoard(ROWS, COLS));
    setAnimStates(createBoard(ROWS, COLS));
    const b = makeTileBag();
    const c = drawTile(b);
    const n = drawTile(b);
    setBag(b);
    setCurrent(c);
    setNext(n);
    setScore(0);
    setFoundWords([]);
    setGameOver(false);
    setMessage("");
  }

  return (
    <div className="app">
      <div className="game-area">
      <h1>WordDrop</h1>

      <div className="topbar">
        <div>Score: {score}</div>
        <div className="tile-preview">Current: <div className="preview">{current}</div></div>
        <div className="tile-preview">Next: <div className="preview small">{next}</div></div>
        <button onClick={handleReset}>Reset</button>
      </div>

      {loadingDict && <div style={{color:"#ffea", marginBottom:8}}>Loading dictionary...</div>}
      {dictError && <div style={{color:"#f88", marginBottom:8}}>Dictionary error: {dictError}</div>}

      <div className={"board" + (isAnimating ? " animating" : "")} style={{ gridTemplateRows: `repeat(${ROWS}, 48px)`, gridTemplateColumns: `repeat(${COLS}, 48px)` }}>
        {board.map((row, rIdx) =>
          row.map((cell, cIdx) => (
            <div key={`${rIdx}:${cIdx}`} className="board-cell" onClick={() => handleColumnClick(cIdx)}>
              <Cell val={cell} animState={animStates[rIdx][cIdx]} />
            </div>
          ))
        )}
      </div>

      <div className="help">
        <p>Click a column to place the current tile. Words {MIN_WORD_LEN}+ letters (horiz, vert, diagonals) are removed automatically.</p>
        <p>{message}</p>
        <p style={{fontSize:12, color:"#aaa"}}>
          Dictionary: {loadingDict ? "loading…" : (wordSet ? `${wordSet.size} words loaded` : "none")}
        </p>
      </div>
      </div>

      <div className="words-list">
        <h3>Words Found ({foundWords.length})</h3>
        <ul>
          {foundWords.map((word, idx) => <li key={idx}>{word}</li>)}
        </ul>
      </div>
    </div>
  );
}
