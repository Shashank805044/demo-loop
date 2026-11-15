import { useEffect, useState } from 'react'
import './App.css'
import { API, apiFetch } from './api'
import { useAuth } from './useAuth'
import AuthForm from './AuthForm'
import MockInterview from './MockInterview'
import ProgressView from './ProgressView'
import QuestionCard from './QuestionCard'
import SavedView from './SavedView'
import type { LevelInfo, Question, Topic } from './types'

type Tab = 'browse' | 'mock' | 'saved' | 'progress'

type SmartResult = {
  usedAI: boolean
  summary: string
  note?: string | null
  fetched?: number
  questions: Question[]
}

export default function App() {
  const { email, ready, signOut } = useAuth()

  const [topics, setTopics] = useState<Topic[]>([])
  const [levels, setLevels] = useState<LevelInfo[]>([])
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(0)
  const [questions, setQuestions] = useState<Question[]>([])
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('browse')
  const [showAuth, setShowAuth] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | undefined>()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Result of an AI-interpreted search (Enter / "Smart search"). null = normal browsing.
  const [smart, setSmart] = useState<SmartResult | null>(null)
  const [smartBusy, setSmartBusy] = useState(false)
  const [smartError, setSmartError] = useState('')

  // Ids of the logged-in user's saved questions.
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const bookmarked = (id: number) => !!email && savedIds.has(id)

  function askLogin(message?: string) {
    setAuthMessage(message)
    setShowAuth(true)
  }

  async function runSmart() {
    const q = search.trim()
    if (!q) return
    setSmartBusy(true)
    setSmartError('')
    try {
      const res = await apiFetch(`/api/search?${new URLSearchParams({ q })}`)
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

  // Load saved-question ids whenever someone logs in.
  useEffect(() => {
    if (!email) return
    apiFetch('/api/me/bookmarks')
      .then(r => (r.ok ? r.json() : []))
      .then((qs: Question[]) => setSavedIds(new Set(qs.map(q => q.id))))
      .catch(() => {})
  }, [email])

  async function toggleBookmark(id: number) {
    if (!email) { askLogin('Log in to save questions and keep your progress.'); return }
    const adding = !savedIds.has(id)
    const set = (on: boolean) => setSavedIds(prev => {
      const n = new Set(prev)
      if (on) n.add(id); else n.delete(id)
      return n
    })
    set(adding) // optimistic
    try {
      const res = await apiFetch(`/api/me/bookmarks/${id}`, { method: adding ? 'PUT' : 'DELETE' })
      if (!res.ok) set(!adding)
    } catch {
      set(!adding)
    }
  }

  const toggle = (id: number) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const goto = (t: Tab) => { setTab(t); setShowAuth(false) }

  return (
    <main>
      <header className="top">
        <h1>Interview Question Hub</h1>
        <div className="account">
          {!ready ? null : email ? (
            <>
              <span className="muted" title={email}>{email}</span>
              <button className="link" onClick={() => { signOut(); setTab(t => (t === 'saved' || t === 'progress') ? 'browse' : t) }}>
                Log out
              </button>
            </>
          ) : (
            <button className="link" onClick={() => (showAuth ? setShowAuth(false) : askLogin())}>
              Log in / Sign up
            </button>
          )}
        </div>
      </header>

      {showAuth && !email && <AuthForm message={authMessage} onDone={() => setShowAuth(false)} />}

      <nav className="tabs">
        <button className={tab === 'browse' ? 'on' : ''} onClick={() => goto('browse')}>Browse questions</button>
        <button className={tab === 'mock' ? 'on' : ''} onClick={() => goto('mock')}>Mock interview</button>
        <button className={tab === 'saved' ? 'on' : ''} onClick={() => goto('saved')}>Saved</button>
        <button className={tab === 'progress' ? 'on' : ''} onClick={() => goto('progress')}>My progress</button>
      </nav>

      {error && <p className="error">{error}</p>}

      {tab === 'mock' && (
        <MockInterview api={API} topics={topics} levels={levels} onNeedLogin={() => askLogin('Log in to save your scores and track your progress.')} />
      )}

      {(tab === 'saved' || tab === 'progress') && !email && ready && (
        <AuthForm message={tab === 'saved'
          ? 'Log in to save questions and find them here.'
          : 'Log in to see your scores and progress over time.'} />
      )}
      {tab === 'saved' && email && (
        <SavedView onRemoved={id => setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n })} />
      )}
      {tab === 'progress' && email && <ProgressView />}

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
            <QuestionCard key={q.id} q={q} open={open.has(q.id)} onToggle={() => toggle(q.id)}
              bookmarked={bookmarked(q.id)} onBookmark={() => toggleBookmark(q.id)} />
          ))}
        </ul>
      </>)}
    </main>
  )
}
