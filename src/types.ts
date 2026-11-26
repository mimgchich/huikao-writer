export type Provider = 'gemini' | 'openai'

export type Settings = {
  provider: Provider
  apiKey: string
  model: string
  baseUrl: string
}

export type Health = {
  ready: boolean
  provider: Provider
  model: string
}

export type Examples = {
  mode: 'ai' | 'demo'
  topic: string
  keys: string[]
  topicReading: string
  gap: string[]
  level3: { content: string; why: string }
  level5: { content: string; why: string; towardSix: string }
}

export type Dimension = {
  name: string
  level: number
  comment: string
}

export type Grade = {
  mode: 'ai' | 'demo' | 'short'
  topic: string
  essaySnapshot: string
  level: number
  summary: string
  nextStep: string
  dimensions: Dimension[]
  strengths: string[]
  suggestions: string[]
  revisedExcerpt: { original: string; revision: string; note: string } | null
  wordCountComment: string
}

export type KeySuggestions = {
  mode: 'ai' | 'demo'
  topic: string
  count: number
  groups: string[][]
  theses: string[]
}

export type RelationScore = {
  score: number | null
  note: string
}

export type Relation = {
  mode: 'ai' | 'demo'
  scores: RelationScore[]
}

export type HistoryItem = {
  id: string
  at: number
  grade: Grade
}
