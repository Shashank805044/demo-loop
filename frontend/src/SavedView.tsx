import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { BookmarkIcon } from './Icons'
import QuestionCard from './QuestionCard'
import type { Question } from './types'

export default function SavedView({ onRemoved, onBrowse }: { onRemoved: (id: number) => void; onBrowse: () => void }) {
  const [items, setItems] = useState<Question[] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/me/bookmarks')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setItems)
      .catch(() => setError('Could not load your saved questions.'))
  }, [])

  async function remove(id: number) {
    const res = await apiFetch(`/api/me/bookmarks/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Could not remove it. Try again.'); return }
    setItems(prev => (prev ?? []).filter(q => q.id !== id))
    onRemoved(id)
  }

  const toggle = (id: number) =>
    setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (error) return <p className="error" role="alert">{error}</p>
  if (!items) return <ul className="cards" aria-busy="true">{[0, 1, 2].map(i => <li key={i} className="skeleton" />)}</ul>
  if (items.length === 0)
    return (
      <div className="empty-state">
        <div className="icon"><BookmarkIcon /></div>
        <h3>Nothing saved yet</h3>
        <p>Tap the star on any question to keep it here for later.</p>
        <button className="btn btn-primary" onClick={onBrowse}>Browse questions</button>
      </div>
    )

  return (
    <>
      <div className="results-head"><h2>{items.length} saved {items.length === 1 ? 'question' : 'questions'}</h2></div>
      <ul className="cards">
        {items.map(q => (
          <QuestionCard key={q.id} q={q} open={open.has(q.id)} onToggle={() => toggle(q.id)}
            bookmarked onBookmark={() => remove(q.id)} />
        ))}
      </ul>
    </>
  )
}
