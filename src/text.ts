const LEVEL_NAMES = ['零', '一', '二', '三', '四', '五', '六']

export function levelLabel(level: number) {
  return `${LEVEL_NAMES[level] ?? '一'}級分`
}

export function countChars(text: string) {
  return text.replace(/\s/g, '').length
}

export function wordHint(count: number) {
  if (count === 0) return '建議分成三段以上。練習時大約 400 到 550 字比較好發揮。'
  if (count < 200) return '字數偏少時，事情往往還停在「我覺得很重要」。試著補上時間、地點和一個動作。'
  if (count < 400) return '已經有內容了。再寫到大約 400 字，轉折比較放得下來。'
  if (count <= 700) return '這個長度夠把一件事寫清楚。送出前檢查每一段是不是都在服務同一個主旨。'
  return '篇幅偏長。看看結尾有沒有把前面的話又說一次。'
}
