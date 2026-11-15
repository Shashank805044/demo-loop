import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { useAuth } from './useAuth'
import { ChartIcon } from './Icons'
import { tone } from './tone'

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
          <span className="bar-label">{label(r)} <small>({r.answered})</small></span>
          <span className="bar-track" aria-hidden="true">
            <span className="bar-fill" style={{ width: `${r.average * 10}%` }} />
          </span>
          <strong className="bar-value">{r.average.toFixed(1)}</strong>
        </li>
      ))}
    </ul>
  )
}

export default function ProgressView({ onPractice }: { onPractice: () => void }) {
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

  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <ul className="cards" aria-busy="true">{[0, 1].map(i => <li key={i} className="skeleton" />)}</ul>

  return (
    <section>
      {data.totalAnswered === 0 ? (
        <div className="empty-state">
          <div className="icon"><ChartIcon /></div>
          <h3>No scores yet</h3>
          <p>Take a mock interview while logged in and your results will show up here.</p>
          <button className="btn btn-primary" onClick={onPractice}>Start a mock interview</button>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card"><div className="num">{data.totalAnswered}</div><div className="lbl">answers scored</div></div>
            <div className="stat-card">
              <div className="num">{data.averageScore?.toFixed(1)}<small> / 10</small></div>
              <div className="lbl">average score · {tone(data.averageScore ?? 0).label.toLowerCase()}</div>
            </div>
            <div className="stat-card"><div className="num">{data.sessions.length}</div><div className="lbl">recent interviews</div></div>
          </div>

          {data.weakest.length > 0 && (
            <p className="practice">
              <strong>Practice next:</strong>
              <span>{data.weakest.map(w => `${w.topic} (avg ${w.average.toFixed(1)})`).join(', ')}</span>
            </p>
          )}

          <h2 className="section-title">By topic</h2>
          <Bars rows={data.byTopic} label={s => s.topic ?? ''} />
          <h2 className="section-title">By level</h2>
          <Bars rows={data.byLevel} label={s => s.level ?? ''} />

          <h2 className="section-title">Recent interviews</h2>
          <div className="list-card">
            <ul className="scorelist">
              {data.sessions.map(s => (
                <li key={s.sessionId}>
                  <span>{when(s.startedAt)} · {s.topics.join(', ')} · {s.answered} answered</span>
                  <strong>{s.average.toFixed(1)}/10</strong>
                </li>
              ))}
            </ul>
          </div>

          <h2 className="section-title">Recent answers</h2>
          <ul className="cards">
            {data.recent.map((r, i) => (
              <li key={i} className="qcard" data-level={r.level.toLowerCase()}>
                <div className="qmeta">
                  <span className="tag">{r.topic}</span>
                  <span className={`badge lvl-${r.level.toLowerCase()}`}>{r.level}</span>
                  <span className="tag" style={{ marginLeft: 'auto' }}>{r.score}/10</span>
                </div>
                <h3>{r.question}</h3>
                <p className="muted">{r.verdict}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="danger-zone">
        <p>Delete your account and everything saved with it: answers, scores and saved questions. This can't be undone.</p>
        <button className="btn btn-danger btn-sm" onClick={remove}>Delete my account</button>
      </div>
    </section>
  )
}
