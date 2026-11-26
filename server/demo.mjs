import { countChars, levelLabel, meaningfulCount } from './text.mjs'

function titleOf(topic) {
  return topic.replace(/[「」]/g, '').slice(0, 36)
}

const TITLE_INDENT = '　　　　'
const PARAGRAPH_INDENT = '　　'

function closeSentence(sentence) {
  return /[。！？…]$/.test(sentence) ? sentence : `${sentence}。`
}

function formatEssay(title, paragraphs) {
  const body = paragraphs.map((paragraph) => `${PARAGRAPH_INDENT}${paragraph}`)
  const head = title ? [`${TITLE_INDENT}${title}`] : []
  return [...head, ...body].join('\n\n')
}

function level3FromKeys(sentences, thesis) {
  const feelings = [
    '我當時好緊張，心裡一直想：接下來要怎麼辦？',
    '我悶悶的，不太想說話。',
    '我有一點高興，也有一點害怕。',
    '我後來才懂，這件事沒有我想的那麼簡單。',
  ]
  const paragraphs = sentences.map(
    (sentence, index) => `${closeSentence(sentence)}${feelings[index % feelings.length]}`,
  )
  if (thesis) paragraphs.push(`所以，我想告訴大家：${closeSentence(thesis)}`)
  return paragraphs
}

function level5FromKeys(sentences, thesis) {
  const crafts = [
    {
      event: (sentence) => `那一刻像等不到的校車，${closeSentence(sentence)}`,
      feeling: '我的心像小鼓一樣，咚咚咚地敲個不停。',
    },
    {
      event: (sentence) => `在好長好長、靜得連風都好像停住的那一刻，${closeSentence(sentence)}`,
      feeling: '我覺得自己小得像一顆被人忘掉的彈珠。',
    },
    {
      event: (sentence) => `看起來輕輕的，心裡卻重重的：${closeSentence(sentence)}`,
      feeling: '這句話說不出口，卻比誰拍拍我的肩膀還清楚。',
    },
    {
      event: (sentence) => `別人早就走遠了，我卻還站在原地。${closeSentence(sentence)}`,
      feeling: '比一比，我才發現自己其實有點害怕。',
    },
  ]
  const paragraphs = sentences.map((sentence, index) => {
    const craft = crafts[index % crafts.length]
    return `${craft.event(sentence)}${craft.feeling}`
  })
  if (thesis) paragraphs.push(`這一切像最後才亮起來的小燈：${closeSentence(thesis)}`)
  return paragraphs
}

export function buildExamples(topic, sentences = [], thesis = '') {
  const title = titleOf(topic)
  const keys = (Array.isArray(sentences) ? sentences : [])
    .map((sentence) => String(sentence || '').replace(/\s+/g, ' ').trim())
    .filter((sentence) => meaningfulCount(sentence) >= 4)
    .slice(0, 8)
  const point = String(thesis || '').replace(/\s+/g, ' ').trim()
  const level3 = formatEssay(title, level3FromKeys(keys, point))
  const level5 = formatEssay(title, level5FromKeys(keys, point))

  return {
    topicReading: '兩篇都用國小中高年級的口氣。開題先寫題目，前面空四個字。每一段開頭空兩個字，先寫事件再寫感想。通順只求句子順，加上修詞技巧的那篇再用小學生寫得出來的比喻、誇飾、映襯和形容。',
    gap: [
      '兩篇都依關鍵句分段，段末各有一句感想，口氣都像國小中高年級。',
      '通順的感想用平常會說的話接上去。',
      '加上修詞技巧的那篇，在事件和感想上再加比喻、誇飾、映襯和形容。',
    ],
    level3: {
      content: level3,
      why: '每個關鍵句各自成段，事件後面用國小中高年級平常會說的話寫一句感想。',
    },
    level5: {
      content: level5,
      why: '同樣用國小中高年級的口氣分段寫事件和感想，並加上比喻、形容、誇飾和映襯。',
      towardSix: '還可以讓前後兩段用到同一個比喻，讀起來更像同一篇。',
    },
  }
}

function coversTopic(topic, essay) {
  const core = topic.replace(/[^\p{Script=Han}]/gu, '').replace(/[我你他她的了在是和與或而也就都很把被讓從到對那這]/g, '')
  if (core.length < 2) return true
  for (let index = 0; index < core.length - 1; index += 1) {
    if (essay.includes(core.slice(index, index + 2))) return true
  }
  return false
}

function paragraphCount(essay) {
  return essay
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean).length
}

export function buildGrade(topic, essay) {
  const chars = countChars(essay)
  const paragraphs = paragraphCount(essay)
  const slogans = essay.match(/總之|不要放棄|繼續加油|變得更好|一定要|我會努力|只要努力|更進步|什麼事情都可以/g) || []
  const details = essay.match(/[0-9０-９]+|雨|窗|聲|味道|鐘|公車|走廊|書包|紙條|椅子/g) || []
  const compact = essay.replace(/\s+/g, '')
  const quote = compact.slice(0, 16) || '這段文字'

  let level = 3
  if (chars < 80) level = 1
  else if (chars < 160) level = 2
  else if (chars < 280) level = 3
  else level = 4

  if (paragraphs >= 4 && chars >= 450 && details.length >= 4 && slogans.length < 2) level += 1
  if (paragraphs < 2) level -= 1
  if (slogans.length >= 3) level -= 1
  if (details.length >= 3 && slogans.length < 2 && chars >= 280) level += 1
  level = Math.max(1, Math.min(5, level))

  let reason = '已經有基本內容，可以再把轉折寫深一點。'
  let nextStep = '把結尾改成你明天會做的一個具體動作。'
  if (chars < 160) {
    reason = '主要是字數太少，事情還沒寫開。'
    nextStep = '先把中間補成三句：誰在場、說了什麼、你做了什麼。'
  } else if (paragraphs < 2) {
    reason = '主要是幾乎沒有分段，結構還站不起來。'
    nextStep = '分成三段：場面、轉折、你現在的認識。'
  } else if (slogans.length >= 2) {
    reason = '感想很多，具體事件不足，結尾又偏口號。'
    nextStep = '刪掉一句「不要放棄」或「繼續加油」，改寫你真正會做的下一步。'
  } else if (details.length < 2) {
    reason = '缺少看得見的細節，讀起來比較像感想。'
    nextStep = `在「${quote}」後面補上一個聲音、天氣，或手上的物品。`
  }

  const suggestions = []
  if (chars < 320) suggestions.push('字數還不夠把事情寫完。試著補上當時誰在場、說了什麼、你做了什麼。')
  if (paragraphs < 3) suggestions.push('請分成至少三段：場面、轉折、你現在的認識。不要一整段寫到底。')
  if (slogans.length >= 2) suggestions.push('結尾少用「不要放棄」「繼續加油」。改成一個你明天真的會做的動作。')
  if (details.length < 2) suggestions.push(`「${quote}」這裡還缺一個看得見的東西，例如聲音、天氣或手上的物品。`)
  if (topic.length <= 24 && !coversTopic(topic, compact)) {
    suggestions.push(`再檢查一次有沒有扣住「${topic}」。如果寫的是別件事，級分會被拉低。`)
  }
  if (suggestions.length < 3) suggestions.push('每一段只推進一層，避免把同一句感想換句話說一次。')

  const strengths = []
  if (paragraphs >= 3) strengths.push('你有分段，閱讀時找得到層次。')
  if (chars >= 400) strengths.push('字數已經夠展開一件事。')
  if (details.length >= 2) strengths.push('文章裡有一些具體的人事物，不只是抽象感想。')
  if (/但是|可是|卻|然而/.test(essay)) strengths.push('你有使用轉折，不只有一直往下說。')
  if (strengths.length === 0) strengths.push('你已經把想法寫出來了，這就可以開始改。')

  return {
    level,
    summary: `整體比較接近${levelLabel(level)}。${reason}`,
    nextStep,
    dimensions: [
      {
        name: '立意取材',
        level: details.length < 2 ? Math.max(1, level - 1) : level,
        comment: details.length < 2 ? '材料還偏空，比較像感想，不像一件發生過的事。' : '看得到一些材料，而且大致沒有離開題意。',
      },
      {
        name: '結構組織',
        level: paragraphs < 2 ? Math.max(1, level - 1) : level,
        comment: paragraphs < 3 ? '段落偏少，場面、轉折和結尾還沒有分開。' : '有分段，層次大致看得到。',
      },
      {
        name: '遣詞造句',
        level: slogans.length >= 2 ? Math.max(1, level - 1) : level,
        comment: slogans.length >= 2 ? '口號句重複出現，句型變化比較少。' : '語句大致清楚，沒有被口號蓋過去。',
      },
    ],
    strengths: strengths.slice(0, 3),
    suggestions: [...new Set(suggestions)].slice(0, 4),
    revisedExcerpt: null,
    wordCountComment:
      chars < 400
        ? `扣掉空白大約 ${chars} 字。練習時寫到 400 字以上，比較有空間把事情寫清楚。`
        : `扣掉空白大約 ${chars} 字。字數已經夠用，接下來看的是細節和結尾。`,
  }
}

function takeTen(pool, shift) {
  const start = ((shift % pool.length) + pool.length) % pool.length
  const ordered = [...pool.slice(start), ...pool.slice(0, start)]
  const unique = []
  for (const item of ordered) {
    const text = item.replace(/\s+/g, ' ').trim()
    if (text && !unique.includes(text)) unique.push(text)
    if (unique.length === 10) break
  }
  return unique
}

function suggestionRole(index, count) {
  if (count === 1) return 'whole'
  if (index === 0) return 'open'
  if (index === count - 1) return 'close'
  return 'middle'
}

export function buildKeySuggestions(topic, count, variant = 0) {
  const title = titleOf(topic) || '這件事'
  const open = [
    `放學後我還站著，才真正碰上「${title}」。`,
    `我把「${title}」先藏在心裡，沒有立刻說出口。`,
    `那一天很普通，直到「${title}」發生在眼前。`,
    `我看著門口，忽然知道「${title}」要開始了。`,
    `手機在手裡，我卻為了「${title}」沒有按下去。`,
    `走廊還很吵，我卻已經走進「${title}」。`,
    `我以為自己做得到，第一步就停在「${title}」。`,
    `一個小動作先出現，後來才連上「${title}」。`,
    `別人先離開，我留下，這就是「${title}」的起點。`,
    `我開口之前沉默了一下，「${title}」從這裡開始。`,
    `雨才停，我還站在原地想「${title}」。`,
    `我把書包拉上肩，心裡卻被「${title}」拉住。`,
  ]
  const middle = [
    `接著我做了一個選擇，才靠近「${title}」。`,
    `有人說了一句話，讓「${title}」不再只是想法。`,
    `我差點轉身離開，又因為「${title}」把腳步收回。`,
    `當時我沒說出口的那句，才是「${title}」的關鍵。`,
    `事情在這裡轉彎：我不再假裝和「${title}」無關。`,
    `我看見別人的反應，才懂「${title}」影響了誰。`,
    `我選了比較容易的那一邊，於是「${title}」被我躲過。`,
    `一個具體的物品提醒我，「${title}」還沒結束。`,
    `我試著解釋，卻發現自己還沒有面對「${title}」。`,
    `這一段只寫一件事：我如何被「${title}」擋住。`,
    `衝突變大以後，我才不得不看清「${title}」。`,
    `我答應了一個忙，結果把自己推進「${title}」。`,
  ]
  const close = [
    `我終於知道，「${title}」不是口號，是當天的選擇。`,
    `事情沒有變偉大，我只是看清「${title}」裡的自己。`,
    `第二天我願意先做一件小事，來面對「${title}」。`,
    `我不再把算了當成「${title}」的結尾。`,
    `原來「${title}」的重量，在於我有沒有說實話。`,
    `我還是會怕，但已經知道「${title}」要我停下來看。`,
    `這篇要留下的，是我對「${title}」的新認識。`,
    `我沒有變成另一個人，只是懂了「${title}」。`,
    `以後再遇到，我會記得「${title}」那天的自己。`,
    `「${title}」教會我的，是先承認，再往前一步。`,
    `我把那句話收回心裡，那就是「${title}」的答案。`,
    `走到這裡我才明白，「${title}」要的是誠實。`,
  ]
  const whole = [
    `那天我碰上「${title}」，才知道自己會先逃避。`,
    `「${title}」發生時，我選了比較容易的那一邊。`,
    `一個場面就夠了：我因為「${title}」停下來。`,
    `我沒有把「${title}」說成大道理，只說自己的選擇。`,
    `別人走了，我還在，這就是「${title}」對我的意思。`,
    `我原本想算了，後來卻為「${title}」說了實話。`,
    `「${title}」讓我看見，自己一直不敢面對的那件事。`,
    `我用一個動作記住「${title}」，而不是用口號。`,
    `那一次的「${title}」，最後變成我認識自己的方式。`,
    `我站在那裡，終於把「${title}」看成自己的事。`,
    `「${title}」不大，卻改變了我下一步怎麼做。`,
    `我留下的那句話，就是「${title}」的全部。`,
  ]
  const pools = { open, middle, close, whole }
  const theses = [
    `這篇真正要講的，是我面對「${title}」時先承認害怕。`,
    `「${title}」的重點不是變勇敢，而是看清自己的選擇。`,
    `我想說的是：逃避過「${title}」，我才知道自己站在哪裡。`,
    `「${title}」留給我的，是一句終於敢說出口的實話。`,
    `整篇要收在這裡：我不再把「${title}」換成好聽的名字。`,
    `我要講的不是大事，是「${title}」裡那個不敢開口的自己。`,
    `「${title}」讓我明白，算了不能當成這件事的結尾。`,
    `這篇的主旨是：我在「${title}」裡選了比較容易的一邊。`,
    `我想留下的認識是，誠實比把「${title}」說漂亮更重要。`,
    `「${title}」真正改變的，是我下一步願不願意先說真話。`,
    `這篇不是要人加油，而是承認「${title}」當時有多重。`,
    `我終於把「${title}」看成自己的事，這就是這篇的主旨。`,
  ]
  const groups = Array.from({ length: count }, (_, index) => {
    const role = suggestionRole(index, count)
    const shift = variant * 3 + (role === 'middle' ? index : 0)
    return takeTen(pools[role], shift)
  })
  return { groups, theses: takeTen(theses, variant * 3) }
}

const RELATION_STOP =
  /[我你他她它的了在是和與或而也就都很把被讓從到對那這一個有沒不才又會要能可已所為之著過得吧呢嗎啊]/g

function relationCore(text) {
  return String(text).replace(/[^\p{Script=Han}]/gu, '').replace(RELATION_STOP, '')
}

function relationNote(score) {
  if (score >= 9) return '這句和主旨幾乎是同一件事。'
  if (score >= 7) return '讀得出來這句在服務主旨。'
  if (score >= 5) return '有碰到主旨，還可以再靠攏。'
  if (score >= 3) return '和主旨只有一點點關係。'
  return '目前看不太出和主旨的關係。'
}

function scorePair(thesis, sentence) {
  const a = relationCore(thesis)
  const b = relationCore(sentence)
  if (a.length < 2 || b.length < 2) {
    return { score: 1, note: '扣掉虛字以後，幾乎沒有可對照的內容。' }
  }
  const grams = (text) => {
    const set = new Set()
    for (let index = 0; index < text.length - 1; index += 1) set.add(text.slice(index, index + 2))
    return set
  }
  const thesisGrams = grams(a)
  const sentenceGrams = grams(b)
  let hit = 0
  for (const gram of sentenceGrams) if (thesisGrams.has(gram)) hit += 1
  const recall = thesisGrams.size ? hit / thesisGrams.size : 0
  const precision = sentenceGrams.size ? hit / sentenceGrams.size : 0
  let phrase = 0
  const window = Math.min(4, a.length)
  for (let size = window; size >= 2 && phrase === 0; size -= 1) {
    for (let index = 0; index <= a.length - size; index += 1) {
      if (b.includes(a.slice(index, index + size))) {
        phrase = size
        break
      }
    }
  }
  let score = Math.round((recall * 0.7 + precision * 0.3) * 10)
  if (phrase >= 4) score = Math.max(score, 8)
  else if (phrase === 3) score = Math.max(score, 6)
  else if (phrase === 0 && hit === 0) score = Math.min(score, 2)
  const compactThesis = thesis.replace(/\s/g, '')
  const compactSentence = sentence.replace(/\s/g, '')
  if (
    compactThesis === compactSentence ||
    (compactSentence.length >= 8 && (compactThesis.includes(compactSentence) || compactSentence.includes(compactThesis)))
  ) {
    score = 10
  }
  score = Math.max(0, Math.min(10, score))
  return { score, note: relationNote(score) }
}

export function buildRelation(thesis, sentences) {
  const thesisReady = meaningfulCount(thesis) >= 4
  return {
    scores: sentences.map((sentence) => {
      if (!thesisReady) return { score: null, note: '主旨太短，還看不出關係。' }
      if (meaningfulCount(sentence) < 4) return { score: null, note: '這段還沒有關鍵句。' }
      return scorePair(thesis, sentence)
    }),
  }
}

export function shortGrade(visibleCount) {
  return {
    level: 0,
    summary: '這次幾乎沒有寫下可以評讀的內容。',
    nextStep: '先寫成三段：發生什麼事、你當時怎麼想、現在懂了什麼。',
    dimensions: [
      { name: '立意取材', level: 0, comment: '還沒有看到明確的材料。' },
      { name: '結構組織', level: 0, comment: '還沒有形成段落。' },
      { name: '遣詞造句', level: 0, comment: '字數太少，無法判斷句子。' },
    ],
    strengths: [],
    suggestions: ['先寫一件真實發生的小事，不要急著下結論。', '至少寫到三百字，評分才看得清楚你的安排。'],
    revisedExcerpt: null,
    wordCountComment: `目前大約 ${visibleCount} 字。`,
  }
}
