import React, { useState, useEffect, useRef } from "react";
import {
  createBoard, makeTileBag, drawTile, placeTile,
  findAllWords, removeMarkedWithWords, LETTER_SCORES
} from "./GameEngine";
import { loadWordSet } from "./Dictionary";
import { supabase } from "./supabase";
import Leaderboard from "./Leaderboard";
import "./index.css";

const ROWS = 8, COLS = 6;
const MIN_WORD_LEN = 3;

function Cell({ val, animState, selected }) {
  const className = "cell " + (val ? "filled " : "") + (animState ? animState + " " : "") + (selected ? "selected" : "");
  return <div className={className}>{val || ""}</div>;
}

export default function App() {
  const [screen, setScreen] = useState('menu'); // 'menu' | 'game' | 'leaderboard'
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
  const [selectedCells, setSelectedCells] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  const [wordSet, setWordSet] = useState(null);
  const [loadingDict, setLoadingDict] = useState(true);
  const [dictError, setDictError] = useState(null);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  function isAdjacent(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
  }

  function getDirection(r1, c1, r2, c2) {
    const dr = r2 - r1;
    const dc = c2 - c1;
    // Normalize to -1, 0, or 1
    return { dr: Math.sign(dr), dc: Math.sign(dc) };
  }

  function isInLine(cells) {
    if (cells.length < 2) return true;
    
    const dir = getDirection(cells[0].row, cells[0].col, cells[1].row, cells[1].col);
    
    for (let i = 1; i < cells.length - 1; i++) {
      const nextDir = getDirection(cells[i].row, cells[i].col, cells[i + 1].row, cells[i + 1].col);
      if (nextDir.dr !== dir.dr || nextDir.dc !== dir.dc) {
        return false;
      }
    }
    return true;
  }

  function handleCellClick(row, col) {
    if (gameOver) return;
    
    // If cell is empty, place a tile in that column
    if (!board[row][col]) {
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
        setShowScoreModal(true);
        setMessage("Game Over — column full!");
        return;
      }
      let newBoard = res.board;

      const placeAnims = createBoard(ROWS, COLS);
      placeAnims[res.placedRow][col] = 'placing';
      setBoard(newBoard);
      setAnimStates(placeAnims);

      const { localBag: afterBag, newCurrent, newNext } = drawFromBag(bag.slice(), next);
      setBag(afterBag);
      setCurrent(newCurrent);
      setNext(newNext);

      setSafeTimeout(() => {
        setAnimStates(createBoard(ROWS, COLS));
      }, 250);

      setMessage("");
      return;
    }
    
    // Cell has a letter - select it for word building
    const cellKey = `${row},${col}`;
    const idx = selectedCells.findIndex(c => c.key === cellKey);
    
    if (idx !== -1) {
      // Deselect if clicking last selected cell
      if (idx === selectedCells.length - 1) {
        setSelectedCells(prev => prev.slice(0, -1));
      }
      return;
    }
    
    // Check adjacency if not first cell
    if (selectedCells.length > 0) {
      const last = selectedCells[selectedCells.length - 1];
      if (!isAdjacent(last.row, last.col, row, col)) {
        setMessage("Letters must be adjacent!");
        return;
      }
    }
    
    const newSelection = [...selectedCells, { row, col, key: cellKey, letter: board[row][col] }];
    
    // Check if still in a straight line
    if (!isInLine(newSelection)) {
      setMessage("Letters must form a straight line!");
      return;
    }
    
    setSelectedCells(prev => newSelection);
    setMessage("");
  }

  function matchesDict(word, dict) {
    if (!word.includes("*")) return dict.has(word) ? word : null;
    
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function* generateCandidates(pattern) {
      const firstStar = pattern.indexOf("*");
      if (firstStar === -1) {
        yield pattern;
        return;
      }
      for (let i = 0; i < letters.length; i++) {
        const next = pattern.slice(0, firstStar) + letters[i] + pattern.slice(firstStar + 1);
        yield* generateCandidates(next);
      }
    }
    
    const starCount = (word.match(/\*/g) || []).length;
    if (starCount >= 4) return null;
    
    for (const candidate of generateCandidates(word)) {
      if (dict.has(candidate)) return candidate;
    }
    return null;
  }

  function handleSubmitWord() {
    if (selectedCells.length < MIN_WORD_LEN) {
      setMessage(`Word must be at least ${MIN_WORD_LEN} letters!`);
      return;
    }
    
    const word = selectedCells.map(c => c.letter).join("");
    const matchedWord = matchesDict(word, wordSet);
    
    if (!wordSet || !matchedWord) {
      setMessage(`"${word}" is not a valid word!`);
      setSelectedCells([]);
      return;
    }
    
    // Remove the selected letters
    const newBoard = board.map(row => [...row]);
    selectedCells.forEach(({ row, col }) => {
      newBoard[row][col] = null;
    });
    
    // Apply gravity
    for (let c = 0; c < COLS; c++) {
      const column = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        if (newBoard[r][c]) column.push(newBoard[r][c]);
      }
      for (let r = ROWS - 1; r >= 0; r--) {
        newBoard[r][c] = column[ROWS - 1 - r] || null;
      }
    }
    
    // Calculate score using letter values
    let baseScore = 0;
    for (let i = 0; i < selectedCells.length; i++) {
      const letter = selectedCells[i].letter;
      const resolvedLetter = (letter !== "*") ? letter : matchedWord[i];
      baseScore += (LETTER_SCORES[resolvedLetter] || 1);
    }
    
    // Apply length bonus: 1x for 3 letters, 2x for 4, 3x for 5, 4x for 6, etc.
    const lengthBonus = selectedCells.length - 2;
    const score = baseScore * lengthBonus;
    
    setBoard(newBoard);
    setScore(s => s + score);
    setFoundWords(prev => [matchedWord, ...prev].slice(0, 100));
    setMessage(`Found "${matchedWord}"! +${score} points${lengthBonus > 1 ? ` (${lengthBonus}x)` : ''}`);
    setSelectedCells([]);
  }

  function handleClearSelection() {
    setSelectedCells([]);
    setMessage("");
  }

  async function handleScoreSubmit() {
    if (!username.trim()) return;
    setSubmitting(true);
    await supabase.from('high_scores').insert({ username: username.trim(), score });
    setSubmitting(false);
    setShowScoreModal(false);
    setScreen('menu');
  }

  function startNewGame() {
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
    setSelectedCells([]);
    setElapsedTime(0);
    setShowScoreModal(false);
    setUsername("");
    setScreen('game');
  }

  function handleEndGame() {
    setGameOver(true);
    setShowScoreModal(true);
  }

  if (screen === 'menu') {
    return (
      <div className="menu">
        <h1>WordDrop</h1>
        <button onClick={startNewGame}>New Game</button>
        <button onClick={() => setScreen('leaderboard')}>Leaderboard</button>
      </div>
    );
  }

  if (screen === 'leaderboard') {
    return <Leaderboard onBack={() => setScreen('menu')} />;
  }

  return (
    <div className="app">
      {showScoreModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#222',padding:24,borderRadius:8,minWidth:280,textAlign:'center'}}>
            <h2 style={{marginTop:0}}>Game Over!</h2>
            <p>Your score: <strong>{score}</strong></p>
            <input
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScoreSubmit()}
              style={{padding:'6px 10px',borderRadius:4,border:'1px solid #555',background:'#333',color:'#fff',width:'100%',boxSizing:'border-box',marginBottom:12}}
              autoFocus
            />
            <div style={{display:'flex',gap:8,justifyContent:'center'}}>
              <button onClick={handleScoreSubmit} disabled={submitting || !username.trim()}>
                {submitting ? 'Submitting...' : 'Submit Score'}
              </button>
              <button onClick={() => { setShowScoreModal(false); setScreen('menu'); }}>Skip</button>
            </div>
          </div>
        </div>
      )}
      <div className="game-area">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
        <h1 style={{margin: 0}}>WordDrop</h1>
        <div style={{fontSize: 18, color: '#aaa'}}>{formatTime(elapsedTime)}</div>
        <button onClick={handleEndGame}>End Game</button>
      </div>

      <div className="topbar">
        <div>Score: {score}</div>
        <div className="tile-preview">Current: <div className="cell filled" style={{background: 'linear-gradient(180deg, #375, #1a4)'}}>{current}</div></div>
        <div className="tile-preview upcoming">Upcoming: <div className="cell filled" style={{background: 'linear-gradient(180deg, #fbbf24, #f59e0b)'}}>{next}</div></div>
      </div>

      {loadingDict && <div style={{color:"#ffea", marginBottom:8}}>Loading dictionary...</div>}
      {dictError && <div style={{color:"#f88", marginBottom:8}}>Dictionary error: {dictError}</div>}

      <div className="word-controls">
        <div>Selected: <strong>{selectedCells.map(c => c.letter).join("")}</strong></div>
        <button onClick={handleSubmitWord} disabled={selectedCells.length < MIN_WORD_LEN}>Submit Word</button>
        <button onClick={handleClearSelection} disabled={selectedCells.length === 0}>Clear</button>
      </div>

      <div className={"board" + (isAnimating ? " animating" : "")} style={{ gridTemplateRows: `repeat(${ROWS}, var(--cell-size))`, gridTemplateColumns: `repeat(${COLS}, var(--cell-size))` }}>
        {board.map((row, rIdx) =>
          row.map((cell, cIdx) => {
            const cellKey = `${rIdx},${cIdx}`;
            const isSelected = selectedCells.some(c => c.key === cellKey);
            return (
              <div key={cellKey} className="board-cell" onClick={() => handleCellClick(rIdx, cIdx)}>
                <Cell val={cell} animState={animStates[rIdx][cIdx]} selected={isSelected} />
              </div>
            );
          })
        )}
      </div>

      <div className="help">
        <p>Tap empty cells to place tiles. Tap filled cells to select letters for a word (must form a line, at least 3 letters long).</p>
        <p>{message}</p>
        <p style={{fontSize:12, color:"#aaa"}}>
          <a href="https://docs.google.com/document/d/10l4neklmU3p75YLZ1Ejfed_--un6gW-Fxy_T5XtrqE4/edit?usp=sharing" target="_blank" rel="noopener noreferrer" style={{color: '#4a9eff', textDecoration: 'none'}}>Word Game Ideas - Share Feedback</a>
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
