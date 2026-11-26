import type { Examples, Grade, Health, KeySuggestions, Relation, Settings } from './types'

export class ApiError extends Error {
  detail?: string

  constructor(message: string, detail?: string) {
    super(message)
    this.detail = detail
  }
}

export function authBody(settings: Settings) {
  if (!settings.apiKey.trim()) return {}
  return {
    provider: settings.provider,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    baseUrl: settings.baseUrl.trim(),
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('連不到本機伺服器。請確認練習室仍在執行。')
  }

  const data = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null
  if (!response.ok) {
    throw new ApiError(data?.error || '這次沒有成功，請再試一次。', data?.detail || '')
  }
  return data as T
}

export function generateExamples(topic: string, sentences: string[], thesis: string, settings: Settings) {
  return post<Examples>('/api/examples', { topic, sentences, thesis, ...authBody(settings) })
}

export function gradeEssay(topic: string, essay: string, settings: Settings) {
  return post<Grade>('/api/grade', { topic, essay, ...authBody(settings) })
}

export function suggestKeySentences(topic: string, count: number, variant: number, settings: Settings) {
  return post<KeySuggestions>('/api/key-sentences', { topic, count, variant, ...authBody(settings) })
}

export function scoreRelation(topic: string, thesis: string, sentences: string[], settings: Settings) {
  return post<Relation>('/api/relation', { topic, thesis, sentences, ...authBody(settings) })
}

export function ping(settings: Settings) {
  return post<{ ok: boolean; error?: string; model?: string }>('/api/ping', authBody(settings))
}

export async function getHealth(): Promise<Health> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return { ready: false, provider: 'gemini', model: '' }
    return (await response.json()) as Health
  } catch {
    return { ready: false, provider: 'gemini', model: '' }
  }
}
