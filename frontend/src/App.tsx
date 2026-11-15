import { useEffect, useState } from 'react'
import './App.css'
import MockInterview from './MockInterview'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5137'

type Topic = { id: number; name: string; slug: string }
type LevelInfo = { id: number; name: string; experience: string }
type SmartResult = {
  usedAI: boolean
  summary: string
  note?: string | null
  fetched?: number
  questions: Question[]
}
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
  const [tab, setTab] = useState<'browse' | 'mock'>('browse')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Result of an AI-interpreted search (Enter / "Smart search"). null = normal browsing.
  const [smart, setSmart] = useState<SmartResult | null>(null)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartError, setSmartError] = useState('')

  async function runSmart() {
    const q = search.trim()
    if (!q) return
    setSmartBusy(true)
    setSmartError('')
    try {
      const res = await fetch(`${API}/api/search?${new URLSearchParams({ q })}`)
      if (res.status === 429) { setSmartError('Too many searches. Wait a minute and try again.'); return }
      if (!res.ok) { setSmartError('Search failed. Try again.'); return }
      const data: SmartResult = await res.json()
      setSmart(data)
      setOpen(new Set())
      if (data.fetched && data.fetched > 0) {
        // New questions (maybe a brand-new topic) were added: refresh the topic chips.
        fetch(`${API}/api/topics`).then(r => r.json()).then(setTopics).catch(() => {})
      }
    } catch {
      setSmartError('Cannot reach the API. Is the backend running?')
    } finally {
      setSmartBusy(false)
    }
  }

  const leaveSmart = () => { setSmart(null); setSmartError('') }
  const shown = smart ? smart.questions : questions

  // Wait for the user to stop typing before querying the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

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
    if (debouncedSearch) params.set('q', debouncedSearch)
    fetch(`${API}/api/questions?${params}`)
      .then(r => r.json())
      .then(setQuestions)
      .catch(() => setError('Cannot reach the API. Is the backend running?'))
  }, [topic, level, debouncedSearch])

  const toggle = (id: number) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  return (
    <main>
      <h1>Interview Question Hub</h1>

      <nav className="tabs">
        <button className={tab === 'browse' ? 'on' : ''} onClick={() => setTab('browse')}>Browse questions</button>
        <button className={tab === 'mock' ? 'on' : ''} onClick={() => setTab('mock')}>Mock interview</button>
      </nav>

      {error && <p className="error">{error}</p>}

      {tab === 'mock' && <MockInterview api={API} topics={topics} levels={levels} />}

      {tab === 'browse' && (<>
      <p className="sub">Search anything, or pick a topic and your experience level.</p>

      <form className="search" onSubmit={e => { e.preventDefault(); runSmart() }}>
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); leaveSmart() }}
          placeholder="Search, or ask: “latest .net questions”, “senior azure”, “beginner sql joins”…"
          aria-label="Search questions"
        />
        <button className="primary inline" type="submit" disabled={smartBusy || !search.trim()}>
          {smartBusy ? 'Searching…' : '✨ Smart search'}
        </button>
        {search && (
          <button type="button" className="link" onClick={() => { setSearch(''); leaveSmart() }}>Clear</button>
        )}
      </form>
      {smartBusy && (
        <p className="muted">
          Understanding your search. If we don't have enough questions yet, I'll look online and add some. This can take up to a minute.
        </p>
      )}
      {smartError && <p className="error">{smartError}</p>}
      {smart && (
        <p className="interp">
          {smart.usedAI ? 'AI understood: ' : ''}<strong>{smart.summary}</strong>
          {smart.note && <><br /><span className="muted">{smart.note}</span></>}
        </p>
      )}

      <section className="filters">
        <div>
          <h2>Topic</h2>
          <div className="chips">
            <button className={topic === '' ? 'on' : ''} onClick={() => { setTopic(''); leaveSmart() }}>All</button>
            {topics.map(t => (
              <button key={t.id} className={topic === t.slug ? 'on' : ''}
                onClick={() => { setTopic(t.slug); leaveSmart() }}>{t.name}</button>
            ))}
          </div>
        </div>
        <div>
          <h2>Level</h2>
          <div className="chips">
            <button className={level === 0 ? 'on' : ''} onClick={() => { setLevel(0); leaveSmart() }}>All</button>
            {levels.map(l => (
              <button key={l.id} className={level === l.id ? 'on' : ''}
                onClick={() => { setLevel(l.id); leaveSmart() }}>
                {l.name} <small>{l.experience}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="count">
        {shown.length} {shown.length === 1 ? 'question' : 'questions'}
        {!smart && debouncedSearch && <> matching “{debouncedSearch}”</>}
      </p>
      {shown.length === 0 && (
        <p className="empty">
          No matches. Try different words, remove a filter, or clear the search.
        </p>
      )}

      <ul className="cards">
        {shown.map(q => (
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
      </>)}
    </main>
  )
}
