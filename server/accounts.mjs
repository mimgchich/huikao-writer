import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const usersFile = join(dataDir, 'users.json')
const sessionsFile = join(dataDir, 'sessions.json')
const COOKIE = 'huikao_session'
const SESSION_MS = 14 * 24 * 60 * 60 * 1000

function ensureStore() {
  mkdirSync(dataDir, { recursive: true })
  if (!existsSync(usersFile)) writeFileSync(usersFile, '[]\n')
  if (!existsSync(sessionsFile)) writeFileSync(sessionsFile, '{}\n')
}

function loadUsers() {
  const users = readJson(usersFile, [])
  let changed = false
  for (const user of users) {
    if (user.role !== 'admin' && user.role !== 'student') {
      user.role = 'student'
      changed = true
    }
  }
  if (users.length && !users.some((user) => user.role === 'admin')) {
    const oldest = [...users].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0]
    oldest.role = 'admin'
    changed = true
  }
  if (changed) writeJson(usersFile, users)
  return users
}

function profile(user) {
  return { id: user.id, username: user.username, admin: user.role === 'admin' }
}

function readJson(file, fallback) {
  ensureStore()
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  ensureStore()
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function nameKey(username) {
  return username.normalize('NFKC').trim().toLowerCase()
}

export function validateUsername(username) {
  const name = String(username || '').normalize('NFKC').trim()
  if (!/^[\p{Script=Han}A-Za-z0-9_]{2,20}$/u.test(name)) {
    throw Object.assign(new Error('帳號請用 2 到 20 個字，可以是中文、英數字或底線。'), { status: 400 })
  }
  return name
}

export function validatePassword(password) {
  const value = String(password || '')
  if (value.length < 6 || value.length > 72) {
    throw Object.assign(new Error('密碼請用 6 到 72 個字。'), { status: 400 })
  }
  return value
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, 32).toString('hex')
}

export function registerAccount(username, password, confirm) {
  const name = validateUsername(username)
  const secret = validatePassword(password)
  if (secret !== String(confirm || '')) {
    throw Object.assign(new Error('兩次輸入的密碼不一樣。'), { status: 400 })
  }
  const users = loadUsers()
  if (users.some((user) => user.key === nameKey(name))) {
    throw Object.assign(new Error('這個帳號已經註冊過。'), { status: 409 })
  }
  const salt = randomBytes(16).toString('hex')
  const user = {
    id: randomBytes(12).toString('hex'),
    username: name,
    key: nameKey(name),
    role: users.length === 0 ? 'admin' : 'student',
    uses: 0,
    salt,
    passwordHash: hashPassword(secret, salt),
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  writeJson(usersFile, users)
  return profile(user)
}

export function loginAccount(username, password) {
  const name = String(username || '').normalize('NFKC').trim()
  const secret = String(password || '')
  const users = loadUsers()
  const user = users.find((item) => item.key === nameKey(name))
  const salt = user?.salt || 'missing-salt'
  const actual = Buffer.from(hashPassword(secret, salt), 'hex')
  const expected = Buffer.from(user?.passwordHash || hashPassword('unused-password', salt), 'hex')
  const same = actual.length === expected.length && timingSafeEqual(actual, expected)
  if (!user || !same) {
    throw Object.assign(new Error('帳號或密碼不正確。'), { status: 401 })
  }
  return profile(user)
}

export function createSession(user) {
  const sessions = readJson(sessionsFile, {})
  const now = Date.now()
  for (const [token, session] of Object.entries(sessions)) {
    if (!session || session.expires <= now) delete sessions[token]
  }
  const token = randomBytes(24).toString('hex')
  sessions[token] = { userId: user.id, username: user.username, expires: now + SESSION_MS }
  writeJson(sessionsFile, sessions)
  return token
}

export function readSession(token) {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return null
  const sessions = readJson(sessionsFile, {})
  const session = sessions[token]
  if (!session || session.expires <= Date.now()) {
    if (session) {
      delete sessions[token]
      writeJson(sessionsFile, sessions)
    }
    return null
  }
  return { userId: session.userId, username: session.username }
}

export function listAccounts(actorName) {
  const users = loadUsers()
  const actor = users.find((user) => user.key === nameKey(String(actorName || '')))
  if (!actor || actor.role !== 'admin') {
    throw Object.assign(new Error('只有管理員可以管理帳號。'), { status: 403 })
  }
  return users.map((user) => ({
    username: user.username,
    admin: user.role === 'admin',
    createdAt: user.createdAt,
    uses: Number(user.uses) || 0,
  }))
}

export function usageSummary() {
  const users = loadUsers()
  return {
    total: users.reduce((sum, user) => sum + (Number(user.uses) || 0), 0),
  }
}

export function recordUse(username) {
  const users = loadUsers()
  const user = users.find((item) => item.key === nameKey(String(username || '')))
  if (!user) return usageSummary()
  user.uses = (Number(user.uses) || 0) + 1
  writeJson(usersFile, users)
  return usageSummary()
}

function dropUserSessions(userId) {
  const sessions = readJson(sessionsFile, {})
  let changed = false
  for (const [token, session] of Object.entries(sessions)) {
    if (session?.userId === userId) {
      delete sessions[token]
      changed = true
    }
  }
  if (changed) writeJson(sessionsFile, sessions)
}

function findManagedUser(actorName, targetName) {
  const users = loadUsers()
  const actor = users.find((user) => user.key === nameKey(String(actorName || '')))
  if (!actor || actor.role !== 'admin') {
    throw Object.assign(new Error('只有管理員可以管理帳號。'), { status: 403 })
  }
  const target = users.find((user) => user.key === nameKey(String(targetName || '')))
  if (!target) throw Object.assign(new Error('找不到這個帳號。'), { status: 404 })
  return { users, actor, target }
}

export function resetAccountPassword(actorName, targetName, password) {
  const secret = validatePassword(password)
  const { users, actor, target } = findManagedUser(actorName, targetName)
  target.salt = randomBytes(16).toString('hex')
  target.passwordHash = hashPassword(secret, target.salt)
  writeJson(usersFile, users)
  if (target.id !== actor.id) dropUserSessions(target.id)
}

export function deleteAccount(actorName, targetName) {
  const { users, actor, target } = findManagedUser(actorName, targetName)
  if (target.id === actor.id) {
    throw Object.assign(new Error('不能刪除自己的帳號。'), { status: 400 })
  }
  if (target.role === 'admin' && users.filter((user) => user.role === 'admin').length <= 1) {
    throw Object.assign(new Error('至少要留下一個管理員。'), { status: 400 })
  }
  writeJson(usersFile, users.filter((user) => user.id !== target.id))
  dropUserSessions(target.id)
}

export function destroySession(token) {
  if (!token) return
  const sessions = readJson(sessionsFile, {})
  if (!sessions[token]) return
  delete sessions[token]
  writeJson(sessionsFile, sessions)
}

export function cookieToken(req) {
  const header = String(req.headers.cookie || '')
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    if (part.slice(0, index).trim() !== COOKIE) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return ''
    }
  }
  return ''
}

export function sessionFromRequest(req) {
  const session = readSession(cookieToken(req))
  if (!session) return null
  const user = loadUsers().find((item) => item.id === session.userId)
  if (!user) return null
  return { username: user.username, admin: user.role === 'admin' }
}

function cookieSecure(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '')
  return forwarded.split(',')[0].trim() === 'https' || Boolean(req.socket?.encrypted)
}

export function setSessionCookie(req, res, token) {
  const secure = cookieSecure(req) ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure}`,
  )
}

export function clearSessionCookie(req, res) {
  const secure = cookieSecure(req) ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`)
}
