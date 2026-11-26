import { useEffect, useRef, useState } from 'react'
import { ApiError, ping } from './api'
import { RUBRIC } from './rubric'
import { countChars, levelLabel, wordHint } from './text'
import type { Examples, Grade, HistoryItem, Settings } from './types'

const EXAMPLE_STEPS = ['寫上題目', '依關鍵句分段', '寫成通順', '加上修詞技巧']
const GRADE_STEPS = ['對照六級分規準', '看立意與材料', '檢查結構與句子', '撰寫修改建議']

export function useStep(active: boolean, steps: readonly string[]) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) return
    setIndex(0)
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % steps.length)
    }, 2200)
    return () => window.clearInterval(timer)
  }, [active, steps])
  return steps[index] ?? steps[0]
}

export function useExamplePhrase(active: boolean) {
  return useStep(active, EXAMPLE_STEPS)
}

export function useGradePhrase(active: boolean) {
  return useStep(active, GRADE_STEPS)
}

export function SectionHead({ index, title, desc }: { index: string; title: string; desc: string }) {
  return (
    <header className="panel-head">
      <span className="index">{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </header>
  )
}

export function SidePanel({ count }: { count: number }) {
  return (
    <aside className="side">
      <section className="rubric">
        <h3>六級分在看什麼</h3>
        <ol>
          {RUBRIC.map((item) => (
            <li key={item.level}>
              <b>{item.name}</b>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
        <p className="fine">總級分是整體判斷，不是三項平均。空白或只抄題目，會是零級分。</p>
      </section>
      <section className="hint">
        <h3>字數提醒</h3>
        <p>{wordHint(count)}</p>
        <p className="fine">這是練習建議，不是會考的硬性規定。</p>
      </section>
    </aside>
  )
}

function EssayCard({
  tone,
  label,
  content,
  why,
  extra,
  copied,
  onCopy,
  onPractice,
}: {
  tone: 'low' | 'high'
  label: string
  content: string
  why: string
  extra?: string
  copied: boolean
  onCopy: () => void
  onPractice?: () => void
}) {
  return (
    <article className={`essay-card ${tone}`}>
      <div className="card-top">
        <span className="badge">{label}</span>
        <span>{countChars(content)} 字</span>
      </div>
      <p className="prose">{content}</p>
      {why && (
        <p className="note">
          <strong>這篇怎麼寫：</strong>
          {why}
        </p>
      )}
      {extra && (
        <p className="note">
          <strong>還可以再加：</strong>
          {extra}
        </p>
      )}
      <div className="card-actions">
        <button type="button" className="btn tiny" onClick={onCopy}>
          {copied ? '已複製' : '複製本文'}
        </button>
        {onPractice && (
          <button type="button" className="btn tiny" onClick={onPractice}>
            用這篇練習改寫
          </button>
        )}
      </div>
    </article>
  )
}

export function ExamplesView({
  data,
  copiedId,
  onCopy,
  onPractice,
}: {
  data: Examples
  copiedId: string
  onCopy: (text: string, id: string) => void
  onPractice: () => void
}) {
  return (
    <div className="examples">
      {data.mode === 'demo' && (
        <p className="banner">
          現在是示範模式，用國小中高年級的口氣。兩篇都先空四格寫題目，每段空兩格寫事件和感想；加上修詞技巧的那篇再用固定修詞套上去。設定 API 金鑰後，才會依你的句子重新寫。
        </p>
      )}
      {data.topicReading && <p className="lede">{data.topicReading}</p>}
      <div className="pair">
        <EssayCard
          tone="low"
          label="通順"
          content={data.level3.content}
          why={data.level3.why}
          copied={copiedId === 'level3'}
          onCopy={() => onCopy(data.level3.content, 'level3')}
          onPractice={onPractice}
        />
        <EssayCard
          tone="high"
          label="加上修詞技巧"
          content={data.level5.content}
          why={data.level5.why}
          extra={data.level5.towardSix}
          copied={copiedId === 'level5'}
          onCopy={() => onCopy(data.level5.content, 'level5')}
        />
      </div>
      {data.gap.length > 0 && (
        <section className="gap-list">
          <h3>兩篇差在哪裡</h3>
          <ol>
            {data.gap.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      )}
      <p className="fine">兩篇都用國小中高年級的口氣，一句關鍵句一段，段末有感想。若要練習，可用通順那篇再自己加上修詞。</p>
    </div>
  )
}

export function GradeView({
  grade,
  stale,
  bridge,
}: {
  grade: Grade
  stale: boolean
  bridge: string
}) {
  const single = grade.strengths.length === 0
  return (
    <div className="grade">
      {stale && <p className="banner">題目或作文已經改過，下面是上一次的評分。</p>}
      {grade.mode === 'demo' && (
        <p className="banner">
          示範評分只看字數、分段和常見空話，用來預覽畫面。設定金鑰後，才會依六級分細讀你的文章。
        </p>
      )}
      <div className="grade-top">
        <div className={`stamp lv-${grade.level}`}>
          <strong>{levelLabel(grade.level)}</strong>
          <span>{grade.mode === 'demo' ? '粗略估計' : '練習參考'}</span>
        </div>
        <div className="grade-copy">
          <p className="kicker">總級分是整體判斷，不是三個項目平均。</p>
          {grade.nextStep && <p className="next-step">{grade.nextStep}</p>}
          {grade.summary && <p className="summary">{grade.summary}</p>}
          {grade.wordCountComment && <p className="fine">{grade.wordCountComment}</p>}
        </div>
      </div>
      <div className="dims">
        {grade.dimensions.map((dimension) => (
          <article key={dimension.name} className="dim">
            <div className="dim-top">
              <h3>
                {dimension.name}
                <b>{levelLabel(dimension.level)}</b>
              </h3>
            </div>
            <span className="meter" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={index} className={index < dimension.level ? 'on' : ''} />
              ))}
            </span>
            {dimension.comment && <p>{dimension.comment}</p>}
          </article>
        ))}
      </div>
      <div className={single ? 'columns single' : 'columns'}>
        {grade.strengths.length > 0 && (
          <section>
            <h3>寫得好的地方</h3>
            <ul className="good">
              {grade.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {grade.suggestions.length > 0 && (
          <section>
            <h3>可以怎麼改</h3>
            <ul className="fix">
              {grade.suggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {grade.revisedExcerpt && (grade.revisedExcerpt.original || grade.revisedExcerpt.revision) && (
        <section className="rewrite">
          <h3>改寫示範</h3>
          <div className="quote-grid">
            {grade.revisedExcerpt.original && (
              <blockquote className="quote old">
                <span>原文</span>
                {grade.revisedExcerpt.original}
              </blockquote>
            )}
            {grade.revisedExcerpt.revision && (
              <blockquote className="quote new">
                <span>改寫</span>
                {grade.revisedExcerpt.revision}
              </blockquote>
            )}
          </div>
          {grade.revisedExcerpt.note && <p className="note">{grade.revisedExcerpt.note}</p>}
        </section>
      )}
      {bridge && (
        <p className="bridge">
          <strong>和範例比一比：</strong>
          {bridge}
        </p>
      )}
      {grade.mode === 'ai' && <p className="fine">供練習對照，不是正式考卷成績。</p>}
    </div>
  )
}

export function HistoryList({
  items,
  onOpen,
  onClear,
}: {
  items: HistoryItem[]
  onOpen: (item: HistoryItem) => void
  onClear: () => void
}) {
  if (items.length === 0) return null
  return (
    <section className="history">
      <div className="history-top">
        <h3>這臺裝置上的最近練習</h3>
        <button type="button" className="btn tiny" onClick={onClear}>
          清除
        </button>
      </div>
      <div className="history-list">
        {items.map((item) => (
          <button type="button" key={item.id} onClick={() => onOpen(item)}>
            <b>{levelLabel(item.grade.level)}</b>
            <span>{item.grade.topic || '未命名題目'}</span>
            <small>
              {new Date(item.at).toLocaleString('zh-TW', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {item.grade.mode === 'demo' ? ' · 示範' : ''}
            </small>
          </button>
        ))}
      </div>
    </section>
  )
}

export function SettingsDialog({
  initial,
  serverReady,
  onClose,
  onSave,
}: {
  initial: Settings
  serverReady: boolean
  onClose: () => void
  onSave: (settings: Settings) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const keyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    keyRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    onSave(draft)
    if (!draft.apiKey.trim()) {
      setMessage(serverReady ? '已儲存。接下來會使用伺服器金鑰。' : '已儲存。目前沒有金鑰，會維持示範模式。')
      return
    }
    setChecking(true)
    setMessage('測試連線中…')
    try {
      const result = await ping(draft)
      setMessage(result.ok ? `連線成功，使用模型 ${result.model || ''}` : result.error || '連線失敗')
    } catch (error) {
      const detail = error instanceof ApiError ? error.detail : ''
      setMessage(error instanceof Error ? error.message : '連線失敗')
      if (detail) setMessage((current) => `${current}\n${detail}`)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-head">
          <h2 id="settings-title">設定模型金鑰</h2>
          <button type="button" className="btn tiny" onClick={onClose}>
            關閉
          </button>
        </div>
        <p className="fine">
          沒有金鑰也能看示範。金鑰只留在這臺瀏覽器，送到你電腦上的練習室伺服器後轉給模型，不會另存資料庫。請在自己的電腦上使用。
        </p>
        {serverReady && <p className="check">這臺電腦的伺服器已經有金鑰。個人金鑰留空時會用它。</p>}
        <label className="field">
          <span>服務</span>
          <select
            value={draft.provider}
            onChange={(event) =>
              setDraft((current) => ({ ...current, provider: event.target.value === 'openai' ? 'openai' : 'gemini' }))
            }
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI 相容</option>
          </select>
        </label>
        <label className="field">
          <span>API 金鑰</span>
          <div className="key-row">
            <input
              ref={keyRef}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
            />
            <button type="button" className="btn tiny" onClick={() => setShowKey((value) => !value)}>
              {showKey ? '隱藏' : '顯示'}
            </button>
          </div>
        </label>
        <label className="field">
          <span>模型名稱（可留空）</span>
          <input
            value={draft.model}
            placeholder={draft.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'}
            onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
          />
        </label>
        {draft.provider === 'openai' && (
          <label className="field">
            <span>Base URL</span>
            <input
              value={draft.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
            />
          </label>
        )}
        <p className="fine">
          Gemini 金鑰可到{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Google AI Studio
          </a>{' '}
          申請。也可以在專案根目錄建立 .env，寫入 GEMINI_API_KEY 後重新啟動。
        </p>
        {message && <p className="check">{message}</p>}
        <div className="actions">
          <button type="button" className="btn primary" onClick={save} disabled={checking}>
            {checking ? '測試中…' : draft.apiKey.trim() ? '儲存並測試' : '儲存'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const cleared = { ...draft, apiKey: '' }
              setDraft(cleared)
              onSave(cleared)
              setMessage('已清除這臺裝置上的金鑰。')
            }}
          >
            清除金鑰
          </button>
        </div>
      </div>
    </div>
  )
}

export function ErrorNote({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="alert" role="alert">
      <p>{message}</p>
      {detail && (
        <details className="tech">
          <summary>技術訊息</summary>
          <p>{detail}</p>
        </details>
      )}
    </div>
  )
}
