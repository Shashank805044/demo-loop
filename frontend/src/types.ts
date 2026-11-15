export type Topic = { id: number; name: string; slug: string }
export type LevelInfo = { id: number; name: string; experience: string }
export type Question = {
  id: number
  topic: string
  level: string
  question: string
  answer: string
  sourceName?: string | null
  sourceUrl?: string | null
  updatedAt: string
}
