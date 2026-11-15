import { useEffect, useState } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5137'

type Topic = { id: number; name: string; slug: string }
type LevelInfo = { id: number; name: string; experience: string }
type Question = {
  id: number
  topic: string
  level: string
  question: string
  answer: string
  sourceName?: string | null
  sourceUrl?: string | null
  updatedAt: string
}

export default function App() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [levels, setLevels] = useState<LevelInfo[]>([])
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(0)
  const [questions, setQuestions] = useState<Question[]>([])
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/topics`).then(r => r.json()),
      fetch(`${API}/api/levels`).then(r => r.json()),
    ])
      .then(([t, l]) => { setTopics(t); setLevels(l) })
      .catch(() => setError('Cannot reach the API. Is the backend running?'))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (topic) params.set('topic', topic)
    if (level) params.set('level', String(level))
    fetch(`${API}/api/questions?${params}`)
      .then(r => r.json())
      .then(setQuestions)
      .catch(() => setError('Cannot reach the API. Is the backend running?'))
  }, [topic, level])

  const toggle = (id: number) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <main>
      <h1>Interview Question Hub</h1>
      <p className="sub">Pick a topic and your experience level.</p>

      {error && <p className="error">{error}</p>}

      <section className="filters">
        <div>
          <h2>Topic</h2>
          <div className="chips">
            <button className={topic === '' ? 'on' : ''} onClick={() => setTopic('')}>All</button>
            {topics.map(t => (
              <button key={t.id} className={topic === t.slug ? 'on' : ''}
                onClick={() => setTopic(t.slug)}>{t.name}</button>
            ))}
          </div>
        </div>
        <div>
          <h2>Level</h2>
          <div className="chips">
            <button className={level === 0 ? 'on' : ''} onClick={() => setLevel(0)}>All</button>
            {levels.map(l => (
              <button key={l.id} className={level === l.id ? 'on' : ''}
                onClick={() => setLevel(l.id)}>
                {l.name} <small>{l.experience}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="count">{questions.length} questions</p>

      <ul className="cards">
        {questions.map(q => (
          <li key={q.id} className="card">
            <div className="meta">
              <span className="tag">{q.topic}</span>
              <span className={`tag lvl-${q.level.toLowerCase()}`}>{q.level}</span>
            </div>
            <h3>{q.question}</h3>
            <button className="link" onClick={() => toggle(q.id)}>
              {open.has(q.id) ? 'Hide answer' : 'Show answer'}
            </button>
            {open.has(q.id) && (
              <div className="answer">
                <p>{q.answer}</p>
                {q.sourceName && (
                  <small>
                    Source:{' '}
                    {q.sourceUrl
                      ? <a href={q.sourceUrl} target="_blank" rel="noreferrer">{q.sourceName}</a>
                      : q.sourceName}
                  </small>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
