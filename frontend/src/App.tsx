import { useEffect, useState } from 'react'
import './App.css'
import { API, apiFetch } from './api'
import AuthDialog from './AuthDialog'
import { AlertIcon, BookmarkIcon, Logo, SearchIcon, SparkleIcon } from './Icons'
import MockInterview from './MockInterview'
import ProgressView from './ProgressView'
import QuestionCard from './QuestionCard'
import SavedView from './SavedView'
import ThemeToggle from './ThemeToggle'
import { useAuth } from './useAuth'
import type { LevelInfo, Question, Topic } from './types'

type Tab = 'browse' | 'mock' | 'saved' | 'progress'

type SmartResult = {
  usedAI: boolean
  summary: string
  note?: string | null
  fetched?: number
  questions: Question[]
}

const EXAMPLES = ['latest .net questions', 'senior azure', 'beginner sql joins', 'docker basics']

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'mock', label: 'Mock interview' },
  { id: 'saved', label: 'Saved' },
  { id: 'progress', label: 'Progress' },
]

export default function App() {
  const { email, ready, signOut } = useAuth()

  const [topics, setTopics] = useState<Topic[]>([])
  const [levels, setLevels] = useState<LevelInfo[]>([])
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(0)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loaded, setLoaded] = useState(false)
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

  async function runSmart(text?: string) {
    const q = (text ?? search).trim()
    if (!q) return
    if (text !== undefined) setSearch(text)
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
      .then(qs => { setQuestions(qs); setLoaded(true) })
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

  const loginPrompt = (tab: 'saved' | 'progress') => (
    <div className="empty-state">
      <div className="icon">{tab === 'saved' ? <BookmarkIcon /> : <SparkleIcon />}</div>
      <h3>{tab === 'saved' ? 'Keep the questions you want to revisit' : 'See how you are improving'}</h3>
      <p>{tab === 'saved'
        ? 'Log in to save questions and find them here on any device.'
        : 'Log in to track your scores, spot weak topics and review past interviews.'}</p>
      <button className="btn btn-primary" onClick={() => askLogin()}>Log in or sign up</button>
    </div>
  )

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="logo" href="/" onClick={e => { e.preventDefault(); setTab('browse') }}>
            <Logo /> Interview Hub
          </a>
          <nav className="tabs" aria-label="Main">
            {TABS.map(t => (
              <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            {!ready ? null : email ? (
              <div className="account">
                <span className="avatar" title={`Logged in as ${email}`} role="img"
                  aria-label={`Logged in as ${email}`}>{email[0].toUpperCase()}</span>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { signOut(); setTab(t => (t === 'saved' || t === 'progress') ? 'browse' : t) }}>
                  Log out
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => askLogin()}>Log in</button>
            )}
          </div>
        </div>
      </header>

      <main className="wrap">
        {error && <p className="error" role="alert">{error}</p>}

        {tab === 'mock' && (
          <MockInterview api={API} topics={topics} levels={levels}
            onNeedLogin={() => askLogin('Log in to save your scores and track your progress.')} />
        )}

        {tab === 'saved' && (email
          ? <SavedView onBrowse={() => setTab('browse')}
              onRemoved={id => setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n })} />
          : ready && loginPrompt('saved'))}

        {tab === 'progress' && (email
          ? <ProgressView onPractice={() => setTab('mock')} />
          : ready && loginPrompt('progress'))}

        {tab === 'browse' && (<>
          <section className="hero">
            <span className="pill"><SparkleIcon /> AI feedback on every answer</span>
            <h1>Ace your next <span>tech interview</span></h1>
            <p className="lead">
              Real questions with clear answers and honest AI feedback. Can't find your topic? Search for it and we'll look online.
            </p>

            <form className="searchbox" onSubmit={e => { e.preventDefault(); runSmart() }} role="search">
              <SearchIcon />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); leaveSmart() }}
                placeholder="Search or ask anything…"
                aria-label="Search questions"
              />
              {search && (
                <button type="button" className="link clear" onClick={() => { setSearch(''); leaveSmart() }}>Clear</button>
              )}
              <button className="btn btn-primary" type="submit" disabled={smartBusy || !search.trim()}>
                {smartBusy ? <><span className="spinner" /> Searching…</> : <><SparkleIcon width={18} height={18} /> Smart search</>}
              </button>
            </form>

            <div className="examples">
              <span className="label">Try:</span>
              {EXAMPLES.map(ex => (
                <button key={ex} className="chip-sm" disabled={smartBusy} onClick={() => runSmart(ex)}>{ex}</button>
              ))}
            </div>
          </section>

          {smartBusy && (
            <p className="busy-note" role="status">
              <span className="spinner" />
              Understanding your search. If we don't have enough questions yet, I'll look online and add some. This can take up to a minute.
            </p>
          )}
          {smartError && <p className="error" role="alert">{smartError}</p>}
          {smart && (
            <div className="callout" role="status">
              <SparkleIcon />
              <div>
                {smart.usedAI ? 'AI understood: ' : ''}<strong>{smart.summary}</strong>
                {smart.note && <span className="note">{smart.note}</span>}
              </div>
            </div>
          )}

          <section className="filters" aria-label="Filters">
            <div className="filter-row">
              <span className="filter-label">Topic</span>
              <div className="chips">
                <button className="chip" aria-pressed={topic === ''} onClick={() => { setTopic(''); leaveSmart() }}>All</button>
                {topics.map(t => (
                  <button key={t.id} className="chip" aria-pressed={topic === t.slug}
                    onClick={() => { setTopic(t.slug); leaveSmart() }}>{t.name}</button>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <span className="filter-label">Level</span>
              <div className="chips">
                <button className="chip" aria-pressed={level === 0} onClick={() => { setLevel(0); leaveSmart() }}>All</button>
                {levels.map(l => (
                  <button key={l.id} className="chip" aria-pressed={level === l.id}
                    onClick={() => { setLevel(l.id); leaveSmart() }}>
                    {l.name} <small>{l.experience}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="results-head">
            <h2>
              {shown.length} {shown.length === 1 ? 'question' : 'questions'}
              {!smart && debouncedSearch && <span className="muted"> matching “{debouncedSearch}”</span>}
            </h2>
          </div>

          {!loaded && !smart ? (
            <ul className="cards" aria-busy="true">{[0, 1, 2].map(i => <li key={i} className="skeleton" />)}</ul>
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <div className="icon"><AlertIcon /></div>
              <h3>No matches</h3>
              <p>Try different words or clear a filter. Press “Smart search” and I'll look online for new questions.</p>
            </div>
          ) : (
            <ul className="cards">
              {shown.map(q => (
                <QuestionCard key={q.id} q={q} open={open.has(q.id)} onToggle={() => toggle(q.id)}
                  bookmarked={bookmarked(q.id)} onBookmark={() => toggleBookmark(q.id)} />
              ))}
            </ul>
          )}
        </>)}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          Questions are rewritten from Stack Overflow (CC BY-SA) with source links. Scores come from Claude and are guidance, not a guarantee.
        </div>
      </footer>

      <AuthDialog open={showAuth && !email} message={authMessage} onClose={() => setShowAuth(false)} />
    </>
  )
}
