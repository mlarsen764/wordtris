import React, { useState, useEffect } from "react";
import {
  createBoard, makeTileBag, drawTile, placeTile,
  findAllWords, removeMarked
} from "./GameEngine";
import { loadWordSet } from "./Dictionary";
import "./index.css";

const ROWS = 8, COLS = 5;
const MIN_WORD_LEN = 4; // change here if you want 3+

function Cell({ val }) {
  return <div className={"cell " + (val ? "filled" : "")}>{val || ""}</div>;
}

export default function App() {
  const [board, setBoard] = useState(() => createBoard(ROWS, COLS));
  const [bag, setBag] = useState(() => makeTileBag());
  const [current, setCurrent] = useState(() => {
    const b = makeTileBag();
    return drawTile(b);
  });
  const [next, setNext] = useState(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("");

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
    const newNext = drawTile(newBag);
    setBag(newBag);
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

    // find words using the loaded dictionary
    const found = findAllWords(newBoard, wordSet, MIN_WORD_LEN);

    if (found.markedPositions && found.markedPositions.size > 0) {
      const { board: after, score: delta } = removeMarked(newBoard, found.markedPositions);
      setScore(s => s + delta);
      newBoard = after;
      setMessage(`Cleared ${found.markedPositions.size} letters from ${found.words.length} words`);
    } else {
      setMessage("");
    }

    setBoard(newBoard);

    // draw next tile
    const newBag = [...bag];
    setBag(newBag);
    doDraw();
  }

  function handleReset() {
    setBoard(createBoard(ROWS, COLS));
    const b = makeTileBag();
    const c = drawTile(b);
    const n = drawTile(b);
    setBag(b);
    setCurrent(c);
    setNext(n);
    setScore(0);
    setGameOver(false);
    setMessage("");
  }

  return (
    <div className="app">
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
              <Cell val={cell} />
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
  );
}
