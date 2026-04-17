import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function Leaderboard({ onBack }) {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('high_scores')
      .select('username, score')
      .order('score', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setScores(data)
        setLoading(false)
      })
  }, [])

  return (
    <div className="menu">
      <h1>Leaderboard</h1>
      {loading ? <p>Loading...</p> : (
        <ol className="leaderboard-list">
          {scores.map((s, i) => (
            <li key={i}>
              <span className="lb-rank">#{i + 1}</span>
              <span className="lb-name">{s.username}</span>
              <span className="lb-score">{s.score}</span>
            </li>
          ))}
          {scores.length === 0 && <p>No scores yet. Be the first!</p>}
        </ol>
      )}
      <button onClick={onBack}>Back</button>
    </div>
  )
}
