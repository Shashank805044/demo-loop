import { useState } from 'react'

type Topic = { id: number; name: string; slug: string }
type LevelInfo = { id: number; name: string; experience: string }
type MockQuestion = { id: number; topic: string; level: string; question: string }
type Result = {
  score: number
  verdict: string
  strengths: string[]
  gaps: string[]
  tip: string
  referenceAnswer: string
}

const MAX_CHARS = 3000

export default function MockInterview({ api, topics, levels }: {
  api: string
  topics: Topic[]
  levels: LevelInfo[]
}) {
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
      if (qs.length === 0) { setError('No questions match that topic and level yet.'); return }
      setQuestions(qs); setIndex(0); setScores([]); setAnswer(''); setResult(null)
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
      const res = await fetch(`${api}/api/mock/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: current.id, answer }),
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
      <section className="mock">
        <p className="sub">Answer questions in your own words. AI scores each answer and shows what you missed.</p>
        <div className="filters">
          <div>
            <h2>Topic</h2>
            <div className="chips">
              <button className={topic === '' ? 'on' : ''} onClick={() => setTopic('')}>Any</button>
              {topics.map(t => (
                <button key={t.id} className={topic === t.slug ? 'on' : ''}
                  onClick={() => setTopic(t.slug)}>{t.name}</button>
              ))}
            </div>
          </div>
          <div>
            <h2>Level</h2>
            <div className="chips">
              <button className={level === 0 ? 'on' : ''} onClick={() => setLevel(0)}>Any</button>
              {levels.map(l => (
                <button key={l.id} className={level === l.id ? 'on' : ''}
                  onClick={() => setLevel(l.id)}>{l.name} <small>{l.experience}</small></button>
              ))}
            </div>
          </div>
          <div>
            <h2>Questions</h2>
            <div className="chips">
              {[3, 5, 10].map(n => (
                <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy} onClick={start}>
          {busy ? 'Starting…' : 'Start interview'}
        </button>
      </section>
    )
  }

  // ---- Summary ----
  if (done) {
    const total = scores.reduce((a, b) => a + b, 0)
    const avg = scores.length ? total / scores.length : 0
    return (
      <section className="mock">
        <div className="card summary">
          <h2>Interview complete</h2>
          <p className="big">{avg.toFixed(1)}<small> / 10 average</small></p>
          <p className="sub">{scores.length} of {questions.length} questions answered</p>
          <ul className="scorelist">
            {questions.map((q, i) => (
              <li key={q.id}>
                <span>{q.question}</span>
                <strong>{scores[i] !== undefined ? `${scores[i]}/10` : '–'}</strong>
              </li>
            ))}
          </ul>
        </div>
        <button className="primary" onClick={reset}>New interview</button>
      </section>
    )
  }

  // ---- Question ----
  return (
    <section className="mock">
      <p className="count">Question {index + 1} of {questions.length}</p>
      <div className="card">
        <div className="meta">
          <span className="tag">{current.topic}</span>
          <span className={`tag lvl-${current.level.toLowerCase()}`}>{current.level}</span>
        </div>
        <h3>{current.question}</h3>

        {!result && (
          <>
            <textarea
              value={answer}
              maxLength={MAX_CHARS}
              rows={7}
              placeholder="Type your answer…"
              onChange={e => setAnswer(e.target.value)}
              disabled={busy}
            />
            <div className="row">
              <small className="muted">{answer.length}/{MAX_CHARS}</small>
              <button className="primary" disabled={busy || !answer.trim()} onClick={submit}>
                {busy ? 'Scoring…' : 'Submit answer'}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="feedback">
            <p className="big">{result.score}<small> / 10</small></p>
            <p>{result.verdict}</p>
            {result.strengths.length > 0 && (
              <><h4>What you got right</h4><ul>{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>
            )}
            {result.gaps.length > 0 && (
              <><h4>What was missing</h4><ul>{result.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></>
            )}
            {result.tip && <p><strong>Tip:</strong> {result.tip}</p>}
            <details>
              <summary>Reference answer</summary>
              <p>{result.referenceAnswer}</p>
            </details>
            <button className="primary" onClick={next}>
              {index + 1 >= questions.length ? 'See results' : 'Next question'}
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
      <button className="link" onClick={reset}>End interview</button>
    </section>
  )
}
