import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachApi, pickEnv } from './api.mjs'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const port = Number(process.env.PORT) || 4173
const host = '0.0.0.0'

function loadDotEnv() {
  const file = fileURLToPath(new URL('../.env', import.meta.url))
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] == null) process.env[key] = value
  }
}

loadDotEnv()
const env = pickEnv(process.env)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function safeFile(urlPath) {
  let decoded = urlPath
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const relative = decoded.replace(/^\/+/, '')
  const file = normalize(join(dist, relative))
  const root = normalize(dist)
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return null
  return file
}

function sendFile(res, file, cache) {
  res.statusCode = 200
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
  res.setHeader('Cache-Control', cache)
  createReadStream(file).pipe(res)
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('不支援這個動作。')
    return
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let file = safeFile(url.pathname)
  if (!file) {
    res.statusCode = 400
    res.end('網址不正確。')
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')

  const cacheFor = (target) => (extname(target) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
  if (existsSync(file) && statSync(file).isFile()) {
    if (req.method === 'HEAD') {
      res.statusCode = 200
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
      res.setHeader('Cache-Control', cacheFor(file))
      res.end()
      return
    }
    sendFile(res, file, cacheFor(file))
    return
  }

  const index = join(dist, 'index.html')
  if (existsSync(index)) {
    sendFile(res, index, 'no-cache')
    return
  }
  res.statusCode = 404
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end('找不到頁面。請先執行 npm run build。')
}

const layers = []
attachApi({ use(fn) { layers.push(fn) } }, env)

function dispatch(req, res, index = 0) {
  const layer = layers[index]
  if (!layer) {
    serveStatic(req, res)
    return
  }
  Promise.resolve(layer(req, res, () => dispatch(req, res, index + 1))).catch((error) => {
    console.error(error)
    if (res.headersSent || res.writableEnded) return
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: '這次沒有成功，請再試一次。' }))
  })
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('[作文練習室] 找不到建置結果，請先執行 npm run build。')
  process.exit(1)
}

const server = createServer((req, res) => dispatch(req, res))
server.listen(port, host, () => {
  const usingKey = Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY)
  console.log(`[作文練習室] 已在連接埠 ${port} 提供網頁`)
  console.log(usingKey ? '[作文練習室] 已讀到 API 金鑰' : '[作文練習室] 未設定 API 金鑰，先使用示範模式')
})
