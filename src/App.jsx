import React, { useState, useEffect } from "react";
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

  const [wordSet, setWordSet] = useState(null);
  const [loadingDict, setLoadingDict] = useState(true);
  const [dictError, setDictError] = useState(null);

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

  function doDraw() {
    const newBag = bag.slice();
    let newCurrent = next;
    if (!newCurrent) newCurrent = drawTile(newBag);
    let newNext = drawTile(newBag);
    
    // Restock bag if empty
    if (!newNext && newBag.length === 0) {
      const restockedBag = makeTileBag();
      newNext = drawTile(restockedBag);
      setBag(restockedBag);
    } else {
      setBag(newBag);
    }
    
    setCurrent(newCurrent);
    setNext(newNext);
  }

  function handleColumnClick(col) {
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

    // Clear placing animation after it completes
    setTimeout(() => {
      setAnimStates(createBoard(ROWS, COLS));
    }, 250);

    // find words using the loaded dictionary
    console.log("Board state:", newBoard);
    const found = findAllWords(newBoard, wordSet, MIN_WORD_LEN);
    console.log("Found words:", found.words.map(w => w.text));

    if (found.markedPositions && found.markedPositions.size > 0) {
      // Wait for placing animation to finish before starting removal
      setTimeout(() => {
        // Mark cells for removal animation
        const removeAnims = createBoard(ROWS, COLS);
        found.markedPositions.forEach(pos => {
          const [r, c] = pos.split(':').map(Number);
          removeAnims[r][c] = 'removing';
        });
        setAnimStates(removeAnims);

        // Wait for fade-out animation, then remove and apply gravity
        setTimeout(() => {
          const { board: after, score: delta } = removeMarkedWithWords(newBoard, found.words);
          
          // Mark cells that moved for falling animation
          const fallAnims = createBoard(ROWS, COLS);
          for (let c = 0; c < COLS; c++) {
            for (let r = ROWS - 1; r >= 0; r--) {
              if (after[r][c] && newBoard[r][c] !== after[r][c]) {
                fallAnims[r][c] = 'falling';
              }
            }
          }
          
          setBoard(after);
          setAnimStates(fallAnims);
          setScore(s => s + delta);
          setFoundWords(prev => [...found.words.map(w => w.text), ...prev].slice(0, 100));
          setMessage(`Cleared ${found.markedPositions.size} letters from ${found.words.length} words`);
          
          // Clear animations after they complete
          setTimeout(() => setAnimStates(createBoard(ROWS, COLS)), 300);
        }, 300);
      }, 250);
    } else {
      setMessage("");
    }

    // draw next tile
    const newBag = [...bag];
    setBag(newBag);
    doDraw();
  }

  function handleReset() {
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

      <div className="board" style={{ gridTemplateRows: `repeat(${ROWS}, 48px)`, gridTemplateColumns: `repeat(${COLS}, 48px)` }}>
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
