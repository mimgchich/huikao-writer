const LEVEL_NAMES = ['零', '一', '二', '三', '四', '五', '六']

export function levelLabel(level) {
  return `${LEVEL_NAMES[level] ?? '一'}級分`
}

export function countChars(text) {
  return String(text ?? '').replace(/\s/g, '').length
}

export function meaningfulCount(text) {
  return (String(text ?? '').match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length
}

export function clampLevel(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 1
  return Math.max(0, Math.min(6, Math.round(number)))
}

export function cleanInput(value, max) {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/```/g, "'''")
    .trim()
    .slice(0, max)
}

export function clip(value, max) {
  const text = restoreBreaks(value)
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function restoreBreaks(value) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim()
  if (!text.includes('\n') && text.includes('\\n')) return text.replace(/\\n/g, '\n').trim()
  return text
}

export function asStringList(value, max) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\n+/)
      : []
  return source
    .map((item) => String(item).trim().replace(/^\d+[.、]\s*/, ''))
    .filter(Boolean)
    .slice(0, max)
}

export function sanitizeDetail(value) {
  return String(value ?? '')
    .replace(/key=[^&\s]+/gi, 'key=***')
    .replace(/AIza[\w-]{8,}/g, '***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '***')
    .slice(0, 240)
}
