import { useEffect, useRef, useState } from 'react'
import { ApiError, scoreRelation, suggestKeySentences } from './api'
import { ErrorNote } from './parts'
import type { KeySuggestions, Relation, Settings } from './types'

type Paragraph = { id: string; text: string }

const STORAGE_KEY = 'huikao-writer-structure'
const MAX_PARAGRAPHS = 8
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function paragraphName(index: number) {
  const number = index + 1
  if (number < 10) return `第${DIGITS[number]}段`
  if (number === 10) return '第十段'
  if (number < 20) return `第十${DIGITS[number - 10]}段`
  return `第${number}段`
}

function createParagraph(): Paragraph {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`
  return { id, text: '' }
}

function defaultParagraphs() {
  return [createParagraph(), createParagraph(), createParagraph()]
}

function readStructure(): { paragraphs: Paragraph[]; thesis: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { paragraphs?: Paragraph[]; thesis?: string }
    if (!Array.isArray(data.paragraphs)) return null
    const paragraphs = data.paragraphs
      .filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string')
      .slice(0, MAX_PARAGRAPHS)
    if (paragraphs.length === 0) return null
    return { paragraphs, thesis: typeof data.thesis === 'string' ? data.thesis : '' }
  } catch {
    return null
  }
}

function placeholderFor(index: number, total: number) {
  if (index === 0) return '開頭的關鍵句：用一個看得見的場面把題目帶出來。'
  if (total > 1 && index === total - 1) return '結尾的關鍵句：收在你現在的認識。'
  return '這段只推進一件事，寫成一句關鍵句。'
}

export function StructurePage({
  topic,
  onTopicChange,
  settings,
  onOutlineChange,
}: {
  topic: string
  onTopicChange: (topic: string) => void
  settings: Settings
  onOutlineChange?: (paragraphs: Paragraph[], thesis: string) => void
}) {
  const [paragraphs, setParagraphs] = useState<Paragraph[]>(defaultParagraphs)
  const [thesis, setThesis] = useState('')
  const [ready, setReady] = useState(false)
  const [suggestions, setSuggestions] = useState<KeySuggestions | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [suggestDetail, setSuggestDetail] = useState('')
  const [variant, setVariant] = useState(0)
  const [placed, setPlaced] = useState('')
  const [relation, setRelation] = useState<Relation | null>(null)
  const [relationKey, setRelationKey] = useState('')
  const [relationError, setRelationError] = useState('')
  const [relationDetail, setRelationDetail] = useState('')
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    const saved = readStructure()
    if (saved) {
      setParagraphs(saved.paragraphs)
      setThesis(saved.thesis)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ paragraphs, thesis }))
    } catch {
      // 瀏覽器若禁止儲存，這次填寫仍留在畫面上。
    }
    onOutlineChange?.(paragraphs, thesis)
  }, [paragraphs, thesis, ready, onOutlineChange])

  useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    pendingFocus.current = null
    const field = document.getElementById(`key-${id}`)
    field?.focus()
    field?.closest('.node')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [paragraphs])

  useEffect(() => {
    if (!ready) return
    const nextTopic = topic.trim()
    if (!nextTopic) {
      setSuggestions(null)
      setSuggesting(false)
      setSuggestError('')
      return
    }
    const count = paragraphs.length
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      setSuggestError('')
      setSuggestDetail('')
      suggestKeySentences(nextTopic, count, variant, settings)
        .then((result) => {
          if (!cancelled) setSuggestions(result)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setSuggestError(error instanceof Error ? error.message : '這次沒有產生關鍵句。')
          setSuggestDetail(error instanceof ApiError ? error.detail || '' : '')
        })
        .finally(() => {
          if (!cancelled) setSuggesting(false)
        })
    }, 450)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, topic, paragraphs.length, variant, settings])

  const relationSignature = `${thesis.trim()}\u0000${paragraphs.map((item) => item.text.trim()).join('\u0001')}`

  useEffect(() => {
    if (!ready) return
    const nextThesis = thesis.trim()
    const sentences = paragraphs.map((item) => item.text.trim())
    const meaningful = (text: string) => (text.match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length
    if (meaningful(nextThesis) < 4 || sentences.every((sentence) => meaningful(sentence) < 4)) {
      setRelation(null)
      setRelationKey('')
      setRelationError('')
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setRelationError('')
      setRelationDetail('')
      scoreRelation(topic.trim(), nextThesis, sentences, settings)
        .then((result) => {
          if (cancelled) return
          setRelation(result)
          setRelationKey(`${nextThesis}\u0000${sentences.join('\u0001')}`)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setRelationError(error instanceof Error ? error.message : '這次沒有算出關係分數。')
          setRelationDetail(error instanceof ApiError ? error.detail || '' : '')
        })
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, topic, thesis, paragraphs, settings])

  function placeSentence(id: string, index: number, sentence: string) {
    updateParagraph(id, sentence)
    setPlaced(`已放進${paragraphName(index)}`)
  }

  function placeThesis(sentence: string) {
    setThesis(sentence)
    setPlaced('已放進主旨')
  }

  function addParagraph() {
    if (paragraphs.length >= MAX_PARAGRAPHS) return
    const next = createParagraph()
    pendingFocus.current = next.id
    setParagraphs((current) => [...current, next])
  }

  function updateParagraph(id: string, text: string) {
    setParagraphs((current) => current.map((item) => (item.id === id ? { ...item, text } : item)))
  }

  function removeParagraph(id: string) {
    setParagraphs((current) => (current.length === 1 ? current : current.filter((item) => item.id !== id)))
  }

  return (
    <section className="panel" id="structure-map" aria-labelledby="structure-title">
      <header className="panel-head">
        <span className="index">構</span>
        <div>
          <h2 id="structure-title">作文結構</h2>
          <p>用方格排出心智圖：先寫題目，再寫每一段的關鍵句，最後收成主旨。選定的關鍵句會各自成段，用國小中高年級的口氣寫成通順，以及加上修詞技巧的兩篇。題目下面的段落可以自行增加或刪除。</p>
        </div>
      </header>

      <div className="mind">
        <section className="mind-box is-topic">
          <label className="field" htmlFor="structure-topic">
            <span>題目</span>
            <input
              id="structure-topic"
              value={topic}
              maxLength={80}
              placeholder="例如：那一次，我學會了等待"
              onChange={(event) => onTopicChange(event.target.value)}
            />
          </label>
        </section>

        <div className="mind-stem" aria-hidden="true" />

        <div className="mind-scroll">
          <div className="mind-row">
            {paragraphs.map((paragraph, index) => (
              <article className="node" key={paragraph.id}>
                <div className="node-top">
                  <h3>{paragraphName(index)}</h3>
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => removeParagraph(paragraph.id)}
                    disabled={paragraphs.length === 1}
                    title={paragraphs.length === 1 ? '至少留下一段' : '刪除這段'}
                  >
                    刪除
                  </button>
                </div>
                <label className="field" htmlFor={`key-${paragraph.id}`}>
                  <span>關鍵句</span>
                  <textarea
                    id={`key-${paragraph.id}`}
                    value={paragraph.text}
                    maxLength={120}
                    rows={4}
                    spellCheck={false}
                    placeholder={placeholderFor(index, paragraphs.length)}
                    onChange={(event) => updateParagraph(paragraph.id, event.target.value)}
                  />
                </label>
              </article>
            ))}
            <button type="button" className="mind-add" onClick={addParagraph} disabled={paragraphs.length >= MAX_PARAGRAPHS}>
              <strong>{paragraphs.length >= MAX_PARAGRAPHS ? '已達八段' : '增加一段'}</strong>
              <span>{paragraphs.length >= MAX_PARAGRAPHS ? '國中作文通常不用再加' : '加在題目之後'}</span>
            </button>
          </div>
        </div>

        <div className="mind-stem" aria-hidden="true" />

        <section className="mind-box is-thesis">
          <label className="field" htmlFor="structure-thesis">
            <span>主旨</span>
            <textarea
              id="structure-thesis"
              value={thesis}
              maxLength={120}
              rows={3}
              spellCheck={false}
              placeholder="用一句話說完這篇真正要講的事。"
              onChange={(event) => setThesis(event.target.value)}
            />
          </label>
        </section>
      </div>
      <p className="fine mind-note">建議三到五段。每一格只留一句，寫全文時再把關鍵句展開。</p>
      <RelationBoard
        paragraphs={paragraphs}
        thesis={thesis}
        signature={relationSignature}
        relation={relation}
        relationKey={relationKey}
        error={relationError}
        detail={relationDetail}
      />
      <KeySentenceBoard
        topic={topic}
        paragraphs={paragraphs}
        thesis={thesis}
        suggestions={suggestions}
        loading={suggesting}
        error={suggestError}
        detail={suggestDetail}
        placed={placed}
        onRefresh={() => setVariant((current) => current + 1)}
        onPlace={placeSentence}
        onPlaceThesis={placeThesis}
      />
    </section>
  )
}

function relationTone(score: number | null) {
  if (score === null) return 'is-empty'
  if (score >= 8) return 'is-high'
  if (score >= 5) return 'is-mid'
  return 'is-low'
}

function RelationBoard({
  paragraphs,
  thesis,
  signature,
  relation,
  relationKey,
  error,
  detail,
}: {
  paragraphs: Paragraph[]
  thesis: string
  signature: string
  relation: Relation | null
  relationKey: string
  error: string
  detail: string
}) {
  const meaningful = (thesis.match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length >= 4
  const hasSentence = paragraphs.some((paragraph) => (paragraph.text.match(/[\p{Script=Han}A-Za-z0-9]/gu) || []).length >= 4)
  const aligned = relation && relationKey === signature && relation.scores.length === paragraphs.length ? relation : null
  const numbers = aligned?.scores.map((item) => item.score).filter((score): score is number => score !== null) ?? []
  const overall = numbers.length ? Math.round(numbers.reduce((sum, score) => sum + score, 0) / numbers.length) : null
  const spoken = aligned
    ? [
        overall === null ? '' : `整體${overall}分。`,
        ...aligned.scores.map((item, index) =>
          item.score === null ? `${paragraphName(index)}尚未填寫。` : `${paragraphName(index)}${item.score}分。`,
        ),
      ].join('')
    : ''

  return (
    <section className="relation-board" aria-labelledby="relation-title">
      <div className="suggest-head">
        <div>
          <h3 id="relation-title">主旨與各段的關係</h3>
          <p>看每一段已經放進格子的關鍵句，和主旨有多靠近。每一段最高 10 分。</p>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
      {!meaningful && <p className="placeholder">先寫上主旨，並在各段放入關鍵句，這裡才會出現關係分數。</p>}
      {meaningful && !hasSentence && <p className="placeholder">各段都還沒有關鍵句。放進一句之後，就會和主旨比較。</p>}
      {meaningful && hasSentence && !aligned && !error && (
        <div className="pending" aria-live="polite">
          <span className="pending-bar" />
          <p>正在看各段關鍵句和主旨的關係。</p>
        </div>
      )}
      {error && <ErrorNote message={error} detail={detail} />}
      {aligned && (
        <>
          {aligned.mode === 'demo' && (
            <p className="banner">這是依用字重疊估算的示範分數，不是會考評分。設定金鑰後，會改看句意是否在服務主旨。</p>
          )}
          <div className="relation-list">
            {overall !== null && (
              <article className={`relation-card is-overall ${relationTone(overall)}`}>
                <h4>整體</h4>
                <p className="relation-score">
                  <strong>{overall}</strong>
                  <span>/10</span>
                </p>
                <p>已填各段的平均，同樣以 10 分為上限。</p>
              </article>
            )}
            {paragraphs.map((paragraph, index) => {
              const item = aligned.scores[index]
              const score = item?.score ?? null
              return (
                <article className={`relation-card ${relationTone(score)}`} key={paragraph.id}>
                  <h4>{paragraphName(index)}</h4>
                  <p className="relation-score">
                    {score === null ? <strong>—</strong> : <strong>{score}</strong>}
                    <span>/10</span>
                  </p>
                  <p>{item?.note || '這段還沒有關鍵句。'}</p>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

function KeySentenceBoard({
  topic,
  paragraphs,
  thesis,
  suggestions,
  loading,
  error,
  detail,
  placed,
  onRefresh,
  onPlace,
  onPlaceThesis,
}: {
  topic: string
  paragraphs: Paragraph[]
  thesis: string
  suggestions: KeySuggestions | null
  loading: boolean
  error: string
  detail: string
  placed: string
  onRefresh: () => void
  onPlace: (id: string, index: number, sentence: string) => void
  onPlaceThesis: (sentence: string) => void
}) {
  const readyTopic = topic.trim()
  const aligned =
    suggestions &&
    suggestions.topic === readyTopic &&
    suggestions.groups.length === paragraphs.length &&
    suggestions.theses?.length === 10
      ? suggestions
      : null

  return (
    <section className="suggest-board" aria-labelledby="suggest-title">
      <div className="suggest-head">
        <div>
          <h3 id="suggest-title">各段關鍵句建議</h3>
          <p>依現在的題目，每一段準備十句。點一句，就放進上面對應的格子。</p>
        </div>
        <button type="button" className="btn primary" onClick={onRefresh} disabled={!readyTopic || loading}>
          {loading ? '正在依題目構思…' : aligned ? '換十句' : '產生十句建議'}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {placed}
      </p>
      {!readyTopic && <p className="placeholder">先寫上題目，這裡才會出現每一段的十句關鍵句。</p>}
      {loading && (
        <div className="pending" aria-live="polite">
          <span className="pending-bar" />
          <p>正在依「{readyTopic}」想各段的關鍵句。</p>
        </div>
      )}
      {error && <ErrorNote message={error} detail={detail} />}
      {aligned && (
        <>
          {aligned.mode === 'demo' && (
            <p className="banner">現在是示範建議，句子會把題目套進常見的開頭、轉折、結尾和主旨。設定金鑰後，會依題目重新寫十句。</p>
          )}
          <div className="suggest-groups">
            {paragraphs.map((paragraph, index) => (
              <article className="suggest-group" key={paragraph.id}>
                <h4>{paragraphName(index)}</h4>
                <ul className="sentence-list">
                  {aligned.groups[index]?.map((sentence) => (
                    <li key={sentence}>
                      <button
                        type="button"
                        aria-pressed={paragraph.text === sentence}
                        onClick={() => onPlace(paragraph.id, index, sentence)}
                      >
                        {sentence}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <article className="suggest-group is-thesis">
            <h4 id="thesis-suggest-title">主旨建議</h4>
            <p>依同一個題目準備十句主旨。點一句，就放進上方的主旨格子。</p>
            <ul className="sentence-list thesis-list">
              {aligned.theses.map((sentence) => (
                <li key={sentence}>
                  <button type="button" aria-pressed={thesis === sentence} onClick={() => onPlaceThesis(sentence)}>
                    {sentence}
                  </button>
                </li>
              ))}
            </ul>
          </article>
        </>
      )}
    </section>
  )
}
