import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { useAuth } from './useAuth'

type Stat = { topic?: string; level?: string; answered: number; average: number }
type Progress = {
  totalAnswered: number
  averageScore: number | null
  byTopic: Stat[]
  byLevel: Stat[]
  weakest: Stat[]
  sessions: { sessionId: string; startedAt: string; answered: number; average: number; topics: string[] }[]
  recent: { questionId: number; topic: string; level: string; question: string; score: number; verdict: string; createdAt: string }[]
}

// The API sends UTC timestamps without a zone marker; treat them as UTC.
const when = (iso: string) =>
  new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Bars({ rows, label }: { rows: Stat[]; label: (s: Stat) => string }) {
  return (
    <ul className="bars">
      {rows.map(r => (
        <li key={label(r)}>
          <span className="bar-label">{label(r)} <small className="muted">({r.answered})</small></span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${r.average * 10}%` }} />
          </span>
          <strong className="bar-value">{r.average.toFixed(1)}</strong>
        </li>
      ))}
    </ul>
  )
}

export default function ProgressView() {
  const { deleteAccount } = useAuth()
  const [data, setData] = useState<Progress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/me/progress')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load your progress.'))
  }, [])

  async function remove() {
    if (!window.confirm('Delete your account and all saved answers, scores and bookmarks? This cannot be undone.')) return
    if (!(await deleteAccount())) setError('Could not delete the account. Try again.')
  }

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <section className="mock">
      {data.totalAnswered === 0 ? (
        <p className="empty">
          No answers yet. Take a mock interview while logged in and your scores will show up here.
        </p>
      ) : (
        <>
          <div className="stats">
            <div className="card stat"><span className="big">{data.totalAnswered}</span><small>answers scored</small></div>
            <div className="card stat">
              <span className="big">{data.averageScore?.toFixed(1)}<small> / 10</small></span><small>average score</small>
            </div>
          </div>

          {data.weakest.length > 0 && (
            <p className="interp">
              <strong>Practice next:</strong> {data.weakest.map(w => `${w.topic} (avg ${w.average.toFixed(1)})`).join(', ')}
            </p>
          )}

          <h2>By topic</h2>
          <Bars rows={data.byTopic} label={s => s.topic ?? ''} />
          <h2>By level</h2>
          <Bars rows={data.byLevel} label={s => s.level ?? ''} />

          <h2>Recent interviews</h2>
          <ul className="scorelist">
            {data.sessions.map(s => (
              <li key={s.sessionId}>
                <span>{when(s.startedAt)} · {s.topics.join(', ')} · {s.answered} answered</span>
                <strong>{s.average.toFixed(1)}/10</strong>
              </li>
            ))}
          </ul>

          <h2>Recent answers</h2>
          <ul className="cards">
            {data.recent.map((r, i) => (
              <li key={i} className="card">
                <div className="meta">
                  <span className="tag">{r.topic}</span>
                  <span className={`tag lvl-${r.level.toLowerCase()}`}>{r.level}</span>
                  <span className="tag">{r.score}/10</span>
                </div>
                <h3>{r.question}</h3>
                <p className="muted">{r.verdict}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr />
      <button className="danger" onClick={remove}>Delete my account and data</button>
    </section>
  )
}
