import { useState } from 'react'
import { apiFetch } from './api'
import { AlertIcon, CheckIcon, MicIcon } from './Icons'
import ScoreRing from './ScoreRing'
import { tone } from './tone'
import { useAuth } from './useAuth'
import type { LevelInfo, Topic } from './types'

type MockQuestion = { id: number; topic: string; level: string; question: string }
type Result = {
  saved: boolean
  score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  tip: string
  referenceAnswer: string
}

const MAX_CHARS = 3000

export default function MockInterview({ api, topics, levels, onNeedLogin }: {
  api: string
  topics: Topic[]
  levels: LevelInfo[]
  onNeedLogin: () => void
}) {
  const { email } = useAuth()
  // Groups the answers of one interview together in the user's history.
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState(0)
  const [count, setCount] = useState(5)

  const [questions, setQuestions] = useState<MockQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [started, setStarted] = useState(false)

  const done = started && index >= questions.length
  const current = questions[index]

  async function start() {
    setError('')
    setBusy(true)
    try {
      const p = new URLSearchParams({ count: String(count) })
      if (topic) p.set('topic', topic)
      if (level) p.set('level', String(level))
      const res = await fetch(`${api}/api/mock/start?${p}`)
      if (!res.ok) throw new Error()
      const qs: MockQuestion[] = await res.json()
      if (qs.length === 0) { setError('No questions match that topic and level yet. Try a different mix.'); return }
      setQuestions(qs); setIndex(0); setScores([]); setAnswer(''); setResult(null)
      setSessionId(crypto.randomUUID())
      setStarted(true)
    } catch {
      setError('Cannot reach the API. Is the backend running?')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!current || !answer.trim()) return
    setError('')
    setBusy(true)
    try {
      const res = await apiFetch('/api/mock/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: current.id, answer, sessionId }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 429) { setError('Too many requests. Wait a minute and try again.'); return }
      if (!res.ok) { setError(body.error ?? 'Scoring failed. Try again.'); return }
      setResult(body as Result)
      setScores(s => [...s, (body as Result).score])
    } catch {
      setError('Cannot reach the API. Is the backend running?')
    } finally {
      setBusy(false)
    }
  }

  function next() {
    setIndex(i => i + 1)
    setAnswer('')
    setResult(null)
    setError('')
  }

  function reset() {
    setStarted(false); setQuestions([]); setIndex(0); setScores([])
    setAnswer(''); setResult(null); setError('')
  }

  // ---- Setup ----
  if (!started) {
    return (
      <section className="mock-setup">
        <div>
          <h2>Mock interview</h2>
          <p className="muted">Answer in your own words. You'll get a score, what you got right, and what was missing.</p>
        </div>
        <div className="panel">
          <div className="filters">
            <div className="filter-row">
              <span className="filter-label">Topic</span>
              <div className="chips">
                <button className="chip" aria-pressed={topic === ''} onClick={() => setTopic('')}>Any</button>
                {topics.map(t => (
                  <button key={t.id} className="chip" aria-pressed={topic === t.slug}
                    onClick={() => setTopic(t.slug)}>{t.name}</button>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <span className="filter-label">Level</span>
              <div className="chips">
                <button className="chip" aria-pressed={level === 0} onClick={() => setLevel(0)}>Any</button>
                {levels.map(l => (
                  <button key={l.id} className="chip" aria-pressed={level === l.id}
                    onClick={() => setLevel(l.id)}>{l.name} <small>{l.experience}</small></button>
                ))}
              </div>
            </div>
            <div className="filter-row">
              <span className="filter-label">Length</span>
              <div className="chips">
                {[3, 5, 10].map(n => (
                  <button key={n} className="chip" aria-pressed={count === n} onClick={() => setCount(n)}>{n} questions</button>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
          <div style={{ marginTop: 22 }}>
            <button className="btn btn-primary" disabled={busy} onClick={start}>
              <MicIcon width={18} height={18} /> {busy ? 'Starting…' : 'Start interview'}
            </button>
          </div>
        </div>
        {!email && (
          <p className="muted">
            <button className="link" onClick={onNeedLogin}>Log in</button> first if you want your scores saved to your progress.
          </p>
        )}
      </section>
    )
  }

  // ---- Summary ----
  if (done) {
    const total = scores.reduce((a, b) => a + b, 0)
    const avg = scores.length ? total / scores.length : 0
    const t = tone(avg)
    return (
      <section>
        <div className="panel summary">
          <h2>Interview complete</h2>
          <ScoreRing score={Math.round(avg * 10) / 10} />
          <p className={`verdict-label ${t.cls}`}>{t.label}</p>
          <p className="muted">{scores.length} of {questions.length} questions answered</p>
          <ul className="scorelist">
            {questions.map((q, i) => (
              <li key={q.id}>
                <span>{q.question}</span>
                <strong>{scores[i] !== undefined ? `${scores[i]}/10` : '–'}</strong>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 22 }}>
            <button className="btn btn-primary" onClick={reset}>New interview</button>
          </div>
        </div>
      </section>
    )
  }

  // ---- Question ----
  const t = result ? tone(result.score) : null
  return (
    <section>
      <div className="stepper">
        <span className="count">Question {index + 1} of {questions.length}</span>
        <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length}
          aria-valuenow={index + (result ? 1 : 0)} aria-label="Interview progress">
          <span style={{ width: `${((index + (result ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
        <button className="link" onClick={reset}>End</button>
      </div>

      <div className="panel">
        <div className="qmeta">
          <span className="tag">{current.topic}</span>
          <span className={`badge lvl-${current.level.toLowerCase()}`}>{current.level}</span>
        </div>
        <h2 className="mock-q">{current.question}</h2>

        {!result && (
          <>
            <label className="sr-only" htmlFor="answer">Your answer</label>
            <textarea
              id="answer"
              className="textarea"
              value={answer}
              maxLength={MAX_CHARS}
              placeholder="Type your answer as you would say it in an interview…"
              onChange={e => setAnswer(e.target.value)}
              disabled={busy}
            />
            <div className="answer-row">
              <small className="muted">{answer.length} / {MAX_CHARS}</small>
              <button className="btn btn-primary" disabled={busy || !answer.trim()} onClick={submit}>
                {busy ? <><span className="spinner" /> Scoring…</> : 'Submit answer'}
              </button>
            </div>
          </>
        )}

        {result && t && (
          <div aria-live="polite">
            <div className="scorebox">
              <ScoreRing score={result.score} />
              <div>
                <p className={`verdict-label ${t.cls}`}>{t.label}</p>
                <p>{result.verdict}</p>
              </div>
            </div>
            <div className="cols">
              {result.strengths.length > 0 && (
                <div className="col good">
                  <h4><CheckIcon /> What you got right</h4>
                  <ul>{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
              {result.gaps.length > 0 && (
                <div className="col gap">
                  <h4><AlertIcon /> What was missing</h4>
                  <ul>{result.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
            {result.tip && <p className="tip"><strong>Tip:</strong> {result.tip}</p>}
            <details className="ref">
              <summary>Show the reference answer</summary>
              <p>{result.referenceAnswer}</p>
            </details>
            {result.saved
              ? <p className="muted">✓ Saved to your progress</p>
              : !email && (
                <p className="muted">
                  This score isn't being saved.{' '}
                  <button className="link" onClick={onNeedLogin}>Log in to keep your progress</button>
                </p>
              )}
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={next}>
                {index + 1 >= questions.length ? 'See results' : 'Next question'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </section>
  )
}
