export interface Question {
  a: number
  b: number
  answer: number
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 洗牌牌堆:把該等級的所有題目組合洗亂,依序發完才重洗,
 * 保證一整輪內不會出現重複題目。
 * 等級越高乘數範圍越大;Lv5 起 6~9 互乘的難題以雙倍權重入堆。
 * minAnswer:過濾掉答案太小的題目(個位數的單音節答案很難辨識)。
 */
export function buildDeck(level: number, minAnswer = 0): Question[] {
  const max = level <= 1 ? 5 : level === 2 ? 7 : 9
  const deck: Question[] = []
  for (let a = 2; a <= max; a++) {
    for (let b = 2; b <= max; b++) {
      if (a * b < minAnswer) continue
      deck.push({ a, b, answer: a * b })
      if (level >= 5 && a >= 6 && b >= 6) deck.push({ a, b, answer: a * b })
    }
  }
  return shuffle(deck)
}
