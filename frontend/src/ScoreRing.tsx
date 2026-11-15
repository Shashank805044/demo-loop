import { tone } from './tone'

/** Circular score gauge. The verdict is also shown as text, so colour is never the only signal. */
export default function ScoreRing({ score, max = 10 }: { score: number; max?: number }) {
  const r = 46
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, score / max))
  const t = tone((score / max) * 10)
  const shown = Number.isInteger(score) ? String(score) : score.toFixed(1)
  return (
    <div className={`ring ${t.cls}`} role="img" aria-label={`Score ${shown} out of ${max}`}>
      <svg viewBox="0 0 108 108">
        <circle className="track" cx="54" cy="54" r={r} fill="none" strokeWidth="9" />
        <circle className="val" cx="54" cy="54" r={r} fill="none" strokeWidth="9"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <div className="num"><span>{shown}<small>/ {max}</small></span></div>
    </div>
  )
}
