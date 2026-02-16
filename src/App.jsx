import React, { useState, useEffect } from "react";
import {
  createBoard, makeTileBag, drawTile, placeTile,
  findAllWords, removeMarked
} from "./GameEngine";
import "./index.css";

const ROWS = 8, COLS = 5;

function Cell({ val }) {
  return <div className={"cell " + (val ? "filled" : "")}>{val || ""}</div>;
}

export default function App() {
  const [board, setBoard] = useState(() => createBoard(ROWS, COLS));
  const [bag, setBag] = useState(() => makeTileBag());
  const [current, setCurrent] = useState(() => drawTile(makeTileBag()).toUpperCase()); // initial tile from own bag
  const [next, setNext] = useState(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("");

  // initialize properly
  useEffect(() => {
    // use same bag for draws
    const b = makeTileBag();
    const c = drawTile(b);
    const n = drawTile(b);
    setBag(b);
    setCurrent(c);
    setNext(n);
  }, []);

  function doDraw() {
    // draw next tile into current and prime next
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
    // find words
    const found = findAllWords(newBoard);
    if (found.markedPositions.size > 0) {
      const { board: after, score: delta } = removeMarked(newBoard, found.markedPositions);
      setScore(s => s + delta);
      newBoard = after;
    }
    setBoard(newBoard);
    // draw next tile
    // draw from bag that was in state
    const newBag = [...bag];
    // current was consumed already, so bag unchanged; we manage drawing by doDraw
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
        <p>Click a column to place the current tile. Words 4+ letters (horiz, vert, diagonals) are removed automatically.</p>
        <p>{message}</p>
      </div>
    </div>
  );
}
