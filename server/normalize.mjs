import { asStringList, clampLevel, clip, countChars } from './text.mjs'

const DIMENSIONS = ['立意取材', '結構組織', '遣詞造句']

function retry(message) {
  const error = new Error(message)
  error.retry = true
  return error
}

export function normalizeExamples(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw retry('模型沒有回傳可讀的範文，請再試一次。')
  }
  if (raw.refused) {
    const error = new Error(clip(raw.reason, 180) || '這個題目不適合做成校園作文範例，請換一個題目。')
    error.status = 400
    throw error
  }

  const level3 = raw.level3 && typeof raw.level3 === 'object' ? raw.level3 : {}
  const level5 = raw.level5 && typeof raw.level5 === 'object' ? raw.level5 : {}
  const content3 = clip(level3.content, 5000)
  const content5 = clip(level5.content, 5000)

  if (countChars(content3) < 8 || countChars(content5) < 8) {
    throw retry('範文沒有寫出來，請再試一次。')
  }

  return {
    topicReading: clip(raw.topicReading, 300),
    gap: asStringList(raw.gap, 4).map((item) => clip(item, 180)),
    level3: {
      content: content3,
      why: clip(level3.why, 400),
    },
    level5: {
      content: content5,
      why: clip(level5.why, 400),
      towardSix: clip(level5.towardSix, 300),
    },
  }
}

function readDimensions(raw, fallback) {
  const list = Array.isArray(raw) ? raw : []
  return DIMENSIONS.map((name) => {
    const found = list.find((item) => String(item?.name ?? '').includes(name.slice(0, 2)))
    return {
      name,
      level: clampLevel(found?.level ?? fallback),
      comment: clip(found?.comment, 400),
    }
  })
}

function asSentence(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\d]+[.、]\s*/, '')
    .trim()
    .slice(0, 80)
}

function takeSentences(source) {
  const unique = []
  const list = Array.isArray(source) ? source : []
  for (const item of list) {
    const text = asSentence(item)
    if (text.length < 8 || unique.includes(text)) continue
    unique.push(text)
    if (unique.length === 10) break
  }
  return unique
}

export function normalizeKeySuggestions(raw, count) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw retry('模型沒有回傳可讀的關鍵句，請再試一次。')
  }
  if (raw.refused) {
    const error = new Error(clip(raw.reason, 180) || '這個題目不適合做成校園作文建議，請換一個題目。')
    error.status = 400
    throw error
  }
  const groups = Array.isArray(raw.groups) ? raw.groups : []
  if (groups.length < count) {
    throw retry('關鍵句的組數不夠，請再試一次。')
  }
  const normalized = groups.slice(0, count).map((group) => takeSentences(group))
  const theses = takeSentences(raw.theses)
  if (normalized.some((group) => group.length < 10)) {
    throw retry('有一段的關鍵句不足十句，請再試一次。')
  }
  if (theses.length < 10) {
    throw retry('主旨建議不足十句，請再試一次。')
  }
  return { groups: normalized, theses }
}

function clampTen(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(10, Math.round(number)))
}

export function normalizeRelation(raw, count) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw retry('模型沒有回傳可讀的關係分數，請再試一次。')
  }
  if (raw.refused) {
    const error = new Error(clip(raw.reason, 180) || '這組內容無法判斷和主旨的關係，請調整後再試。')
    error.status = 400
    throw error
  }
  const scores = Array.isArray(raw.scores) ? raw.scores : []
  if (scores.length < count) throw retry('關係分數的段數不夠，請再試一次。')
  return {
    scores: scores.slice(0, count).map((item) => ({
      score: clampTen(item?.score),
      note: clip(item?.note, 80) || '這句和主旨的關係如分數所示。',
    })),
  }
}

export function normalizeGrade(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw retry('模型沒有回傳可讀的評分，請再試一次。')
  }
  if (raw.refused) {
    const error = new Error(clip(raw.reason, 180) || '這篇內容無法提供寫作評分，請調整後再試。')
    error.status = 400
    throw error
  }

  const level = clampLevel(raw.level)
  const revision = raw.revisedExcerpt && typeof raw.revisedExcerpt === 'object' ? raw.revisedExcerpt : null
  const original = clip(revision?.original, 800)
  const rewritten = clip(revision?.revision, 800)
  const revisedExcerpt =
    original || rewritten
      ? {
          original,
          revision: rewritten,
          note: clip(revision?.note, 300),
        }
      : null

  return {
    level,
    summary: clip(raw.summary, 700),
    nextStep: clip(raw.nextStep, 200),
    dimensions: readDimensions(raw.dimensions, level),
    strengths: asStringList(raw.strengths, 4).map((item) => clip(item, 300)),
    suggestions: asStringList(raw.suggestions, 5).map((item) => clip(item, 300)),
    revisedExcerpt,
    wordCountComment: clip(raw.wordCountComment, 300),
  }
}
