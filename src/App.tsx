import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, generateExamples, getHealth, gradeEssay } from './api'
import {
  ErrorNote,
  ExamplesView,
  GradeView,
  HistoryList,
  SectionHead,
  SettingsDialog,
  SidePanel,
  useExamplePhrase,
  useGradePhrase,
} from './parts'
import { StructurePage } from './StructurePage'
import { countChars } from './text'
import type { Examples, Grade, Health, HistoryItem, Settings } from './types'

type PageName = 'write' | 'structure'

function pageFromHash(): PageName {
  return location.hash === '#structure' ? 'structure' : 'write'
}

const SETTINGS_KEY = 'huikao-writer-settings'
const DRAFT_KEY = 'huikao-writer-draft'
const HISTORY_KEY = 'huikao-writer-history'
const STRUCTURE_KEY = 'huikao-writer-structure'

type OutlineParagraph = { id: string; text: string }
type Outline = { paragraphs: OutlineParagraph[]; thesis: string }

function meaningfulLength(text: string) {
  return (text.match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length
}

function loadOutline(): Outline {
  const raw = readStorage<{ paragraphs?: OutlineParagraph[]; thesis?: string }>(STRUCTURE_KEY, {})
  const paragraphs = Array.isArray(raw.paragraphs)
    ? raw.paragraphs.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string').slice(0, 8)
    : []
  return { paragraphs, thesis: typeof raw.thesis === 'string' ? raw.thesis : '' }
}
const TOPICS = ['那一次，我學會了等待', '在轉彎的地方', '我願意分享的一件事', '失敗以後', '一句話的重量']

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 瀏覽器若禁止儲存，仍可繼續這次練習。
  }
}

function loadSettings(): Settings {
  const raw = readStorage<Partial<Settings>>(SETTINGS_KEY, {})
  return {
    provider: raw.provider === 'openai' ? 'openai' : 'gemini',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    model: typeof raw.model === 'string' ? raw.model : '',
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
  }
}

function loadHistory(): HistoryItem[] {
  const raw = readStorage<HistoryItem[]>(HISTORY_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw.filter((item) => item && item.grade && typeof item.grade.level === 'number').slice(0, 8)
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [health, setHealth] = useState<Health | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [page, setPage] = useState<PageName>(pageFromHash)
  const [topic, setTopic] = useState('')
  const [essay, setEssay] = useState('')
  const [outline, setOutline] = useState<Outline>(loadOutline)
  const [hydrated, setHydrated] = useState(false)
  const [examples, setExamples] = useState<Examples | null>(null)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const [exampleLoading, setExampleLoading] = useState(false)
  const [gradeLoading, setGradeLoading] = useState(false)
  const [exampleError, setExampleError] = useState('')
  const [exampleDetail, setExampleDetail] = useState('')
  const [gradeError, setGradeError] = useState('')
  const [gradeDetail, setGradeDetail] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const essayRef = useRef<HTMLTextAreaElement>(null)
  const scoreRef = useRef<HTMLElement>(null)
  const examplePhrase = useExamplePhrase(exampleLoading)
  const gradePhrase = useGradePhrase(gradeLoading)
  const count = countChars(essay)

  useEffect(() => {
    const draft = readStorage<{ topic?: string; essay?: string }>(DRAFT_KEY, {})
    if (typeof draft.topic === 'string') setTopic(draft.topic)
    if (typeof draft.essay === 'string') setEssay(draft.essay)
    setHydrated(true)
    getHealth().then(setHealth)
    function onHash() {
      setPage(pageFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    writeStorage(DRAFT_KEY, { topic, essay })
  }, [topic, essay, hydrated])

  const selectedKeys = outline.paragraphs.map((item) => item.text.trim()).filter((text) => meaningfulLength(text) >= 4)

  const personal = settings.apiKey.trim().length > 0
  const statusText = personal ? '使用裝置內的金鑰' : !health ? '確認連線中' : health.ready ? '使用伺服器金鑰' : '示範模式'
  const connected = personal || Boolean(health?.ready)
  const stale = Boolean(grade && (grade.topic !== topic.trim() || grade.essaySnapshot !== essay.trim()))
  const bridge =
    grade &&
    examples &&
    !stale &&
    examples.topic === topic.trim() &&
    grade.topic === topic.trim() &&
    examples.gap[0]
      ? examples.gap[0]
      : ''

  async function onGenerate() {
    const nextTopic = topic.trim()
    if (!nextTopic) {
      setExampleError('請先輸入題目。')
      return
    }
    setExampleLoading(true)
    setExampleError('')
    setExampleDetail('')
    try {
      const result = await generateExamples(nextTopic, selectedKeys, outline.thesis.trim(), settings)
      setExamples(result)
    } catch (error) {
      setExampleError(error instanceof Error ? error.message : '產生範例失敗。')
      setExampleDetail(error instanceof ApiError ? error.detail || '' : '')
    } finally {
      setExampleLoading(false)
    }
  }

  async function onGrade() {
    const nextTopic = topic.trim()
    const nextEssay = essay.trim()
    if (!nextTopic) {
      setGradeError('請先寫上題目，評分才知道有沒有扣題。')
      return
    }
    if (!nextEssay) {
      setGradeError('請先寫下你的作文。')
      return
    }
    setGradeLoading(true)
    setGradeError('')
    setGradeDetail('')
    try {
      const result = await gradeEssay(nextTopic, nextEssay, settings)
      setGrade(result)
      const item: HistoryItem = { id: `${Date.now()}`, at: Date.now(), grade: result }
      const nextHistory = [item, ...history.filter((entry) => entry.grade.essaySnapshot !== result.essaySnapshot)].slice(0, 8)
      setHistory(nextHistory)
      writeStorage(HISTORY_KEY, nextHistory)
      requestAnimationFrame(() => scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (error) {
      setGradeError(error instanceof Error ? error.message : '評分失敗。')
      setGradeDetail(error instanceof ApiError ? error.detail || '' : '')
    } finally {
      setGradeLoading(false)
    }
  }

  function applyPractice(content: string) {
    setEssay(content)
    setReplaceOpen(false)
    requestAnimationFrame(() => {
      essayRef.current?.focus()
      document.getElementById('write')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const updateOutline = useCallback((paragraphs: OutlineParagraph[], thesis: string) => {
    setOutline({ paragraphs, thesis })
  }, [])

  function saveSettings(next: Settings) {
    setSettings(next)
    writeStorage(SETTINGS_KEY, next)
  }

  return (
    <div className="page">
      <a className="skip" href={page === 'structure' ? '#structure-map' : '#write'}>
        {page === 'structure' ? '前往結構圖' : '前往作文欄'}
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            寫
          </span>
          <div className="brand-copy">
            <p className="eyebrow">國中教育會考 · 寫作測驗</p>
            <h1>作文練習室</h1>
            <p>
              {page === 'structure'
                ? '先把題目、各段關鍵句和主旨排成心智圖，再回到作文練習寫全文。'
                : '用國小中高年級的口氣，依每個關鍵句寫出通順，以及加上修詞技巧的兩篇。'}
            </p>
          </div>
        </div>
        <div className="top-actions">
          <p className={connected ? 'status live' : 'status demo'}>{statusText}</p>
          <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
            設定金鑰
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="頁面">
        <a
          href="#write"
          aria-current={page === 'write' ? 'page' : undefined}
          onClick={() => setPage('write')}
        >
          作文練習
        </a>
        <a
          href="#structure"
          aria-current={page === 'structure' ? 'page' : undefined}
          onClick={() => setPage('structure')}
        >
          作文結構
        </a>
      </nav>

      <main>
        {page === 'structure' ? (
          <StructurePage
            topic={topic}
            onTopicChange={setTopic}
            settings={settings}
            onOutlineChange={updateOutline}
          />
        ) : (
          <>
        <section className="panel" aria-labelledby="topic-title">
          <SectionHead
            index="01"
            title="題目"
            desc="範文用國小中高年級的口氣。開題先空四個字寫題目。通順和加上修詞技巧都按關鍵句分段，每段空兩個字，事件後寫感想。加上修詞技巧再加形容、誇飾、映襯、比喻。"
          />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onGenerate()
            }}
          >
            <label className="field" htmlFor="topic-input">
              <span id="topic-title">作文題目</span>
              <input
                id="topic-input"
                value={topic}
                maxLength={80}
                placeholder="例如：那一次，我學會了等待"
                onChange={(event) => setTopic(event.target.value)}
              />
            </label>
            <div className="chips" aria-label="練習題">
              {TOPICS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={topic === item ? 'chip on' : 'chip'}
                  aria-pressed={topic === item}
                  onClick={() => setTopic(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {selectedKeys.length > 0 ? (
              <ol className="key-preview" aria-label="將用來寫範文的關鍵句">
                {selectedKeys.map((sentence, index) => (
                  <li key={`${index}-${sentence}`}>{sentence}</li>
                ))}
              </ol>
            ) : (
              <p className="placeholder">請先到作文結構，為各段選定關鍵句。範文會照這些句子的順序展開。</p>
            )}
            <div className="actions">
              <button
                type="submit"
                className="btn primary"
                disabled={exampleLoading || topic.trim().length === 0 || selectedKeys.length === 0}
                aria-busy={exampleLoading}
              >
                {exampleLoading ? '正在撰寫範例…' : '依關鍵句產生範例'}
              </button>
            </div>
          </form>
          {exampleLoading && (
            <div className="pending" aria-live="polite">
              <span className="pending-bar" />
              <p>{examplePhrase}</p>
            </div>
          )}
          {exampleError && <ErrorNote message={exampleError} detail={exampleDetail} />}
          {examples ? (
            <ExamplesView
              data={examples}
              copiedId={copiedId}
              onCopy={(text, id) => {
                navigator.clipboard
                  .writeText(text)
                  .then(() => {
                    setCopiedId(id)
                    window.setTimeout(() => setCopiedId((current) => (current === id ? '' : current)), 1600)
                  })
                  .catch(() => setExampleError('這次沒能複製，請自行選取文字。'))
              }}
              onPractice={() => {
                if (essay.trim() && essay.trim() !== examples.level3.content.trim()) {
                  setReplaceOpen(true)
                  return
                }
                applyPractice(examples.level3.content)
              }}
            />
          ) : (
              <p className="placeholder">範例會出現在這裡。一篇是通順，一篇是加上修詞技巧。兩篇都用國小中高年級的口氣，先寫題目，再按關鍵句分段。</p>
          )}
          {replaceOpen && examples && (
            <div className="confirm">
              <p>作文欄裡已有文字。要改成通順那篇，練習自己加上修詞嗎？</p>
              <button type="button" className="btn primary" onClick={() => applyPractice(examples.level3.content)}>
                改成通順
              </button>
              <button type="button" className="btn ghost" onClick={() => setReplaceOpen(false)}>
                保留原文
              </button>
            </div>
          )}
        </section>

        <section className="panel" id="write" aria-labelledby="essay-title">
          <SectionHead index="02" title="作文" desc="寫完送出，依會考寫作六級分給總級分、分項說明與修改建議。" />
          <div className="compose">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void onGrade()
              }}
            >
              <label className="field" htmlFor="essay-input">
                <span id="essay-title">我的作文</span>
                <small>Ctrl + Enter 送出評分</small>
              </label>
              <div className="editor">
                <textarea
                  id="essay-input"
                  ref={essayRef}
                  value={essay}
                  maxLength={2500}
                  spellCheck={false}
                  placeholder="從一個具體的場面寫起。例如：放學時、誰在場、你做了什麼決定。接著寫轉折，最後寫你現在怎麼看這件事。"
                  onChange={(event) => setEssay(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void onGrade()
                    }
                  }}
                />
                <span className={count < 200 ? 'count low' : count <= 700 ? 'count ok' : 'count high'}>{count} 字</span>
              </div>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={gradeLoading || essay.trim().length === 0} aria-busy={gradeLoading}>
                  {gradeLoading ? '正在評讀…' : '評分並給建議'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setEssay('')} disabled={essay.length === 0}>
                  清空作文
                </button>
              </div>
            </form>
            <SidePanel count={count} />
          </div>
          {gradeLoading && (
            <div className="pending" aria-live="polite">
              <span className="pending-bar" />
              <p>{gradePhrase}</p>
            </div>
          )}
          {gradeError && <ErrorNote message={gradeError} detail={gradeDetail} />}
          {grade && (
            <section ref={scoreRef} aria-label="評分結果">
              <GradeView grade={grade} stale={stale} bridge={bridge} />
            </section>
          )}
          <HistoryList
            items={history}
            onOpen={(item) => {
              setTopic(item.grade.topic)
              setEssay(item.grade.essaySnapshot)
              setGrade(item.grade)
              requestAnimationFrame(() => scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
            }}
            onClear={() => {
              setHistory([])
              writeStorage(HISTORY_KEY, [])
            }}
          />
        </section>
          </>
        )}
      </main>

      <footer className="foot">
        <p>國中教育會考寫作測驗採用六級分。這裡的範文與評分用來對照學習，不代表正式考試成績。</p>
      </footer>
      {settingsOpen && (
        <SettingsDialog
          initial={settings}
          serverReady={Boolean(health?.ready)}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
    </div>
  )
}

