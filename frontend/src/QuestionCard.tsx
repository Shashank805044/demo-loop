import { useId } from 'react'
import { ChevronIcon, StarIcon } from './Icons'
import type { Question } from './types'

export default function QuestionCard({ q, open, onToggle, bookmarked, onBookmark }: {
  q: Question
  open: boolean
  onToggle: () => void
  bookmarked?: boolean
  onBookmark?: () => void
}) {
  const panelId = useId()
  return (
    <li className="qcard" data-level={q.level.toLowerCase()}>
      <div className="qmeta">
        <span className="tag">{q.topic}</span>
        <span className={`badge lvl-${q.level.toLowerCase()}`}>{q.level}</span>
        {onBookmark && (
          <button className="star" onClick={onBookmark} aria-pressed={!!bookmarked}
            aria-label={bookmarked ? 'Remove from saved questions' : 'Save this question'}
            title={bookmarked ? 'Saved. Click to remove' : 'Save this question'}>
            <StarIcon filled={bookmarked} />
          </button>
        )}
      </div>
      <h3>{q.question}</h3>
      <button className="link reveal-toggle" onClick={onToggle} aria-expanded={open} aria-controls={panelId}>
        {open ? 'Hide answer' : 'Show answer'} <ChevronIcon />
      </button>
      {/* Always rendered so it can animate; `inert` keeps it out of tab order and screen readers while closed. */}
      <div id={panelId} className="reveal" data-open={open} inert={!open}>
        <div>
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
        </div>
      </div>
    </li>
  )
}
