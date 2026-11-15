import type { Question } from './types'

export default function QuestionCard({ q, open, onToggle, bookmarked, onBookmark }: {
  q: Question
  open: boolean
  onToggle: () => void
  bookmarked?: boolean
  onBookmark?: () => void
}) {
  return (
    <li className="card">
      <div className="meta">
        <span className="tag">{q.topic}</span>
        <span className={`tag lvl-${q.level.toLowerCase()}`}>{q.level}</span>
        {onBookmark && (
          <button className="star" onClick={onBookmark}
            aria-pressed={!!bookmarked}
            aria-label={bookmarked ? 'Remove from saved questions' : 'Save this question'}
            title={bookmarked ? 'Saved. Click to remove' : 'Save this question'}>
            {bookmarked ? '★' : '☆'}
          </button>
        )}
      </div>
      <h3>{q.question}</h3>
      <button className="link" onClick={onToggle}>{open ? 'Hide answer' : 'Show answer'}</button>
      {open && (
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
  )
}
