import { useEffect, useState } from 'react'
import { ApiError, deleteAccount, listAccounts, resetAccountPassword, type AccountRow } from './api'

function formatTime(value: string) {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '—'
  return time.toLocaleString('zh-TW', { hour12: false })
}

export function AccountsPage({ self }: { self: string }) {
  const [rows, setRows] = useState<AccountRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  async function reload() {
    setRows(await listAccounts())
  }

  useEffect(() => {
    reload().catch((reason) => setError(reason instanceof ApiError ? reason.message : '讀不到帳號名單。'))
  }, [])

  async function onReset(username: string) {
    const password = passwords[username] || ''
    setError('')
    setNotice('')
    setBusy(username)
    try {
      await resetAccountPassword(username, password)
      setPasswords((current) => ({ ...current, [username]: '' }))
      setNotice(`已重設「${username}」的密碼。`)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '這次沒有成功，請再試一次。')
    } finally {
      setBusy('')
    }
  }

  async function onDelete(username: string) {
    if (!window.confirm(`要刪除帳號「${username}」嗎？刪除後這個帳號就不能再登入。`)) return
    setError('')
    setNotice('')
    setBusy(username)
    try {
      await deleteAccount(username)
      setNotice(`已刪除「${username}」。`)
      await reload()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '這次沒有成功，請再試一次。')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="panel" aria-labelledby="accounts-title">
      <header className="panel-head">
        <span className="index">帳</span>
        <div>
          <h2 id="accounts-title">帳號管理</h2>
          <p>這裡看得到已註冊的帳號。可以幫別人重設密碼，或刪除不再使用的帳號。密碼不會顯示。</p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="fine">{notice}</p>}
      <div className="account-table" role="table">
        <div className="account-row head" role="row">
          <span>帳號</span>
          <span>身分</span>
          <span>使用次數</span>
          <span>註冊時間</span>
          <span>管理</span>
        </div>
        {rows.map((row) => (
          <div className="account-row" role="row" key={row.username}>
            <strong>{row.username}</strong>
            <span>{row.admin ? '管理員' : '學生'}</span>
            <span>{row.uses}</span>
            <span>{formatTime(row.createdAt)}</span>
            <div className="account-actions">
              <input
                type="password"
                aria-label={`${row.username} 的新密碼`}
                placeholder="新密碼"
                value={passwords[row.username] || ''}
                maxLength={72}
                onChange={(event) => setPasswords((current) => ({ ...current, [row.username]: event.target.value }))}
              />
              <button type="button" className="btn tiny" disabled={busy === row.username} onClick={() => onReset(row.username)}>
                重設密碼
              </button>
              {row.username !== self && (
                <button type="button" className="btn tiny" disabled={busy === row.username} onClick={() => onDelete(row.username)}>
                  刪除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
