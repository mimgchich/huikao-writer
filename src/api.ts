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
    throw new ApiError('連不到伺服器。請稍後再試一次。')
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

export type SessionUser = { username: string; admin: boolean }

export type AccountRow = { username: string; admin: boolean; createdAt: string; uses: number }

export function registerAccount(username: string, password: string, confirm: string) {
  return post<SessionUser>('/api/auth/register', { username, password, confirm })
}

export function loginAccount(username: string, password: string) {
  return post<SessionUser>('/api/auth/login', { username, password })
}

export async function currentUser(): Promise<SessionUser | null> {
  try {
    const response = await fetch('/api/auth/me')
    if (!response.ok) return null
    const data = (await response.json()) as { username?: string; admin?: boolean }
    return data.username ? { username: data.username, admin: Boolean(data.admin) } : null
  } catch {
    return null
  }
}

export function listAccounts() {
  return fetch('/api/admin/users').then(async (response) => {
    const data = (await response.json().catch(() => null)) as { error?: string; users?: AccountRow[] } | null
    if (!response.ok) throw new ApiError(data?.error || '讀不到帳號名單。')
    return data?.users || []
  })
}

export function resetAccountPassword(username: string, password: string) {
  return post<{ ok: boolean }>('/api/admin/password', { username, password })
}

export function deleteAccount(username: string) {
  return post<{ ok: boolean }>('/api/admin/delete', { username })
}

export async function getUsage(): Promise<{ total: number }> {
  const response = await fetch('/api/usage')
  const data = (await response.json().catch(() => null)) as { error?: string; total?: number } | null
  if (!response.ok) throw new ApiError(data?.error || '讀不到使用次數。')
  return { total: Number(data?.total) || 0 }
}

export function logoutAccount() {
  return post<{ ok: boolean }>('/api/auth/logout', {})
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
