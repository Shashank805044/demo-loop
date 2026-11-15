import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import QuestionCard from './QuestionCard'
import type { Question } from './types'

export default function SavedView({ onRemoved }: { onRemoved: (id: number) => void }) {
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

  if (error) return <p className="error">{error}</p>
  if (!items) return <p className="muted">Loading…</p>
  if (items.length === 0)
    return <p className="empty">Nothing saved yet. Click the ☆ on any question in Browse to keep it here.</p>

  return (
    <ul className="cards">
      {items.map(q => (
        <QuestionCard key={q.id} q={q} open={open.has(q.id)} onToggle={() => toggle(q.id)}
          bookmarked onBookmark={() => remove(q.id)} />
      ))}
    </ul>
  )
}
