/** Maps a 0-10 score to a colour class and a text label (so colour is never the only signal). */
export function tone(score: number): { cls: string; label: string } {
  if (score >= 7) return { cls: 'tone-good', label: 'Strong answer' }
  if (score >= 4) return { cls: 'tone-warn', label: 'Getting there' }
  return { cls: 'tone-bad', label: 'Needs work' }
}
