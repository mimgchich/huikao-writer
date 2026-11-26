import { useState, type FormEvent } from 'react'
import { ApiError, loginAccount, registerAccount } from './api'

type Mode = 'login' | 'register'

export function AuthPage({ onLogin }: { onLogin: (user: { username: string; admin: boolean }) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user =
        mode === 'register'
          ? await registerAccount(username, password, confirm)
          : await loginAccount(username, password)
      onLogin(user)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '這次沒有成功，請再試一次。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page gate-page">
      <section className="gate" aria-labelledby="gate-title">
        <span className="brand-mark" aria-hidden="true">
          寫
        </span>
        <p className="eyebrow">國中教育會考 · 寫作測驗</p>
        <h1 id="gate-title">作文練習室</h1>
        <p className="gate-lead">請先註冊帳號。登入之後才能使用作文練習和作文結構。</p>
        <div className="gate-tabs" role="tablist" aria-label="登入或註冊">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'on' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            登入
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'on' : ''}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            註冊
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label className="field">
            <span>帳號</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              maxLength={20}
              required
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field">
            <span>密碼</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              maxLength={72}
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>再輸入一次密碼</span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                maxLength={72}
                required
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '處理中…' : mode === 'register' ? '註冊並進入' : '登入'}
          </button>
        </form>
      </section>
    </div>
  )
}
