import { buildExamples, buildGrade, buildKeySuggestions, buildRelation, shortGrade } from './demo.mjs'
import { normalizeExamples, normalizeGrade, normalizeKeySuggestions, normalizeRelation } from './normalize.mjs'
import { exampleSchema, examplesPrompt, gradePrompt, gradeSchema, keySentencePrompt, keySentenceSchema, relationPrompt, relationSchema } from './prompts.mjs'
import { cleanInput, countChars, meaningfulCount, sanitizeDetail } from './text.mjs'

export function pickEnv(fileEnv = {}) {
  const read = (key) => String(process.env[key] || fileEnv[key] || '').trim()
  return {
    PROVIDER: read('PROVIDER'),
    GEMINI_API_KEY: read('GEMINI_API_KEY'),
    GEMINI_MODEL: read('GEMINI_MODEL'),
    OPENAI_API_KEY: read('OPENAI_API_KEY'),
    OPENAI_BASE_URL: read('OPENAI_BASE_URL'),
    OPENAI_MODEL: read('OPENAI_MODEL'),
  }
}

function resolveAuth(body, env) {
  const personal = String(body?.apiKey || '').trim()
  if (personal) {
    const provider = body.provider === 'openai' ? 'openai' : 'gemini'
    return {
      provider,
      apiKey: personal,
      model:
        String(body.model || '').trim() ||
        (provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'),
      baseUrl: String(body.baseUrl || '').trim(),
    }
  }

  if (env.PROVIDER === 'openai' && env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: env.OPENAI_BASE_URL,
    }
  }
  if (env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      baseUrl: '',
    }
  }
  if (env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      baseUrl: env.OPENAI_BASE_URL,
    }
  }
  return null
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 120_000) {
        reject(Object.assign(new Error('內容過長。'), { status: 400 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readJson(req) {
  const text = await readBody(req)
  if (!text.trim()) return {}
  try {
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('bad')
    }
    return data
  } catch {
    throw Object.assign(new Error('內容格式不正確。'), { status: 400 })
  }
}

function friendly(status, message) {
  const text = String(message || '')
  if (status === 401 || status === 403 || /api key|API_KEY_INVALID|permission|unauthorized/i.test(text)) {
    return '金鑰沒有權限或已失效，請到設定檢查。'
  }
  if (status === 404 || /not found|model/i.test(text)) {
    return '找不到這個模型。Gemini 可試 gemini-2.5-flash，或改填其他可用的模型名稱。'
  }
  if (status === 429) return '目前請求太頻繁或額度不足，請稍後再試。'
  if (status >= 500) return '模型服務暫時忙碌，請稍後再試。'
  return '這次沒有產生成功，請再試一次。'
}

function fail(status, message, detail = '') {
  return Object.assign(new Error(friendly(status, message)), {
    status: status === 400 || status === 401 || status === 403 || status === 404 || status === 429 ? status : 502,
    detail: sanitizeDetail(detail || message),
  })
}

function parseJson(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) {
    throw Object.assign(new Error('模型沒有回傳內容，請再試一次。'), { retry: true })
  }
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')]
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      const start = candidate.indexOf('{')
      const end = candidate.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1))
        } catch {
          // try the next candidate
        }
      }
    }
  }
  throw Object.assign(new Error('模型沒有回傳可讀的結果，請再試一次。'), { retry: true })
}

async function readError(response) {
  const data = await response.json().catch(() => null)
  const message = data?.error?.message || data?.error || response.statusText || ''
  return typeof message === 'string' ? message : JSON.stringify(message)
}

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, done: () => clearTimeout(timer) }
}

function thinkingConfigFor(model) {
  const name = String(model || '')
  if (/gemini-2\.5/i.test(name)) return { thinkingBudget: 0 }
  if (/gemini-3/i.test(name)) return { thinkingLevel: 'MINIMAL' }
  return null
}

function candidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || []
  const visible = parts
    .filter((part) => !part.thought)
    .map((part) => part.text || '')
    .join('')
    .trim()
  if (visible) return visible
  const hidden = parts.map((part) => part.text || '').join('').trim()
  if (hidden.includes('{') && hidden.includes('}')) return hidden
  return ''
}

async function geminiChat(auth, prompt, schema, temperature, maxOutputTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(auth.model)}:generateContent`
  // 思考用掉的 token 也算進 maxOutputTokens。範文較長時，第一次會寫到空白，所以接著拿掉上限再要一次。
  const plans = [
    { schema: true, thinking: true, cap: maxOutputTokens },
    { schema: true, thinking: true, cap: 0 },
    { schema: false, thinking: false, cap: 0 },
  ]

  let lastError = null
  let skipThinking = false
  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index]
    if (plan.thinking && skipThinking) continue
    const generationConfig = { temperature }
    if (plan.cap) generationConfig.maxOutputTokens = plan.cap
    if (plan.schema && schema) {
      generationConfig.responseMimeType = 'application/json'
      generationConfig.responseSchema = schema
    }
    if (plan.thinking) {
      const thinking = thinkingConfigFor(auth.model)
      if (thinking) generationConfig.thinkingConfig = thinking
    }

    const timer = withTimeout(55_000)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': auth.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: timer.signal,
      })
      if (!response.ok) {
        const message = await readError(response)
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw fail(response.status, message, message)
        }
        if (/thinkingBudget|thinking_budget|thinkingConfig|thinkingLevel/i.test(message)) skipThinking = true
        lastError = fail(response.status, message, message)
        continue
      }
      const data = await response.json()
      if (data.promptFeedback?.blockReason) {
        throw Object.assign(new Error('這次的內容無法產生，請調整題目或作文後再試。'), { status: 400 })
      }
      const finish = data?.candidates?.[0]?.finishReason || ''
      const text = candidateText(data)
      if (!text || finish === 'MAX_TOKENS') {
        const detail = finish === 'MAX_TOKENS' ? 'finishReason=MAX_TOKENS' : 'empty candidate'
        console.warn(`[作文練習室] 模型沒有寫完內容（${detail}），改設定再試。`)
        lastError = Object.assign(new Error('模型這次沒有把內容寫完，請再試一次。'), { detail })
        continue
      }
      return text
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error('模型回應太久，請再試一次。'), { status: 504 })
      }
      if (error.status === 401 || error.status === 403 || error.status === 429) throw error
      if (error.status === 400 && error.message === '這次的內容無法產生，請調整題目或作文後再試。') throw error
      lastError = error
    } finally {
      timer.done()
    }
  }
  if (lastError) lastError.retry = false
  throw lastError || new Error('這次沒有產生成功，請再試一次。')
}

function openaiUrl(base) {
  const clean = (base || 'https://api.openai.com/v1').replace(/\/$/, '')
  if (clean.endsWith('/chat/completions')) return clean
  return `${clean}/chat/completions`
}

async function openaiChat(auth, prompt, temperature, maxOutputTokens) {
  const timer = withTimeout(55_000)
  try {
    const response = await fetch(openaiUrl(auth.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.apiKey}`,
      },
      body: JSON.stringify({
        model: auth.model,
        temperature,
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: timer.signal,
    })
    if (!response.ok) {
      const message = await readError(response)
      throw fail(response.status, message, message)
    }
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    const text = Array.isArray(content)
      ? content.map((part) => part.text || '').join('')
      : String(content || '')
    if (!text.trim()) throw Object.assign(new Error('模型沒有回傳內容，請再試一次。'), { retry: true })
    return text.trim()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('模型回應太久，請再試一次。'), { status: 504 })
    }
    throw error
  } finally {
    timer.done()
  }
}

async function complete(auth, prompt, schema, temperature, maxOutputTokens) {
  if (auth.provider === 'openai') return openaiChat(auth, prompt, temperature, maxOutputTokens)
  return geminiChat(auth, prompt, schema, temperature, maxOutputTokens)
}

async function runModel(auth, prompt, schema, temperature, maxOutputTokens, normalize) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await complete(auth, prompt, schema, temperature, maxOutputTokens)
      return normalize(parseJson(text))
    } catch (error) {
      lastError = error
      if (!error.retry || attempt === 1) throw error
    }
  }
  throw lastError
}

function publicError(error) {
  const status = error.status || 500
  return {
    status,
    payload: {
      error: error.message || '伺服器發生錯誤。',
      detail: error.detail ? sanitizeDetail(error.detail) : '',
    },
  }
}

function chosenSentences(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 8)
    .map((item) => cleanInput(item, 120))
    .filter((item) => meaningfulCount(item) >= 4)
}

async function postExamples(body, env) {
  const topic = cleanInput(body.topic, 80)
  const sentences = chosenSentences(body.sentences)
  const thesis = cleanInput(body.thesis, 120)
  if (!topic) {
    throw Object.assign(new Error('請先輸入題目。'), { status: 400 })
  }
  if (sentences.length === 0) {
    throw Object.assign(new Error('請先在作文結構選定至少一句關鍵句。'), { status: 400 })
  }
  const auth = resolveAuth(body, env)
  if (!auth) {
    return { mode: 'demo', topic, keys: sentences, ...normalizeExamples(buildExamples(topic, sentences, thesis)) }
  }
  const result = await runModel(
    auth,
    examplesPrompt(topic, sentences, thesis),
    exampleSchema,
    0.85,
    8192,
    normalizeExamples,
  )
  return { mode: 'ai', topic, keys: sentences, ...result }
}

async function postGrade(body, env) {
  const topic = cleanInput(body.topic, 80)
  const essay = cleanInput(body.essay, 2500)
  if (!topic) throw Object.assign(new Error('請先輸入題目。'), { status: 400 })
  if (!essay) throw Object.assign(new Error('請先寫下作文。'), { status: 400 })
  if (meaningfulCount(essay) < 8) {
    return { ...shortGrade(countChars(essay)), mode: 'short', topic, essaySnapshot: essay }
  }
  const auth = resolveAuth(body, env)
  if (!auth) {
    return { ...buildGrade(topic, essay), mode: 'demo', topic, essaySnapshot: essay }
  }
  const result = await runModel(auth, gradePrompt(topic, essay), gradeSchema, 0.4, 4096, normalizeGrade)
  return { ...result, mode: 'ai', topic, essaySnapshot: essay }
}

async function postKeySentences(body, env) {
  const topic = cleanInput(body.topic, 80)
  const count = Number(body.count)
  const variant = Number.isInteger(Number(body.variant)) ? Math.max(0, Math.min(20, Number(body.variant))) : 0
  if (!topic) throw Object.assign(new Error('請先輸入題目。'), { status: 400 })
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    throw Object.assign(new Error('段落數量需要在一到八段之間。'), { status: 400 })
  }
  const auth = resolveAuth(body, env)
  if (!auth) {
    return { mode: 'demo', topic, count, ...buildKeySuggestions(topic, count, variant) }
  }
  const result = await runModel(
    auth,
    keySentencePrompt(topic, count, variant),
    keySentenceSchema,
    0.9,
    8192,
    (raw) => normalizeKeySuggestions(raw, count),
  )
  return { mode: 'ai', topic, count, ...result }
}

async function postRelation(body, env) {
  const topic = cleanInput(body.topic, 80)
  const thesis = cleanInput(body.thesis, 120)
  const sentences = Array.isArray(body.sentences) ? body.sentences.slice(0, 8).map((item) => cleanInput(item, 120)) : null
  if (!thesis) throw Object.assign(new Error('請先寫下主旨。'), { status: 400 })
  if (!sentences || sentences.length < 1 || sentences.length > 8) {
    throw Object.assign(new Error('請先安排一到八段關鍵句。'), { status: 400 })
  }
  const blank = (text) => meaningfulCount(text) < 4
  const local = buildRelation(thesis, sentences)
  if (blank(thesis) || sentences.every(blank)) return { mode: 'demo', scores: local.scores }
  const auth = resolveAuth(body, env)
  if (!auth) return { mode: 'demo', scores: local.scores }

  const filled = sentences.map((sentence, index) => ({ sentence, index })).filter((item) => !blank(item.sentence))
  const result = await runModel(
    auth,
    relationPrompt(topic, thesis, filled.map((item) => item.sentence)),
    relationSchema,
    0.2,
    2048,
    (raw) => normalizeRelation(raw, filled.length),
  )
  const scores = local.scores.map((item) => ({ ...item }))
  filled.forEach((item, order) => {
    scores[item.index] = result.scores[order]
  })
  return { mode: 'ai', scores }
}

async function postPing(body, env) {
  const auth = resolveAuth(body, env)
  if (!auth) return { ok: false, error: '尚未設定金鑰。' }
  await complete(auth, '請只輸出 JSON：{"ok":true}。不要寫其他文字。', null, 0, 128)
  return { ok: true, model: auth.model }
}

export function attachApi(middlewares, env) {
  middlewares.use(async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/api/')) return next()

    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const auth = resolveAuth({}, env)
        sendJson(res, 200, {
          ready: Boolean(auth),
          provider: auth?.provider || 'gemini',
          model: auth?.model || '',
        })
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 404, { error: '找不到這個功能。' })
        return
      }

      const body = await readJson(req)
      if (url.pathname === '/api/examples') {
        sendJson(res, 200, await postExamples(body, env))
        return
      }
      if (url.pathname === '/api/grade') {
        sendJson(res, 200, await postGrade(body, env))
        return
      }
      if (url.pathname === '/api/key-sentences') {
        sendJson(res, 200, await postKeySentences(body, env))
        return
      }
      if (url.pathname === '/api/relation') {
        sendJson(res, 200, await postRelation(body, env))
        return
      }
      if (url.pathname === '/api/ping') {
        sendJson(res, 200, await postPing(body, env))
        return
      }
      sendJson(res, 404, { error: '找不到這個功能。' })
    } catch (error) {
      if (res.headersSent || res.writableEnded) return
      const result = publicError(error)
      sendJson(res, result.status, result.payload)
    }
  })
}
