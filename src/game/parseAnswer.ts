/**
 * ASR 後處理層:Web Speech 的原始文字 → 玩家想說的數字。
 * 分四層,由嚴到寬:
 *   1. 直接解析(阿拉伯數字 + 中文數字)
 *   2. 剝除贅詞後再解析(「答案是…」「等於…」)
 *   3. 同音字校正後再解析(我是六 → 五十六)
 *   4. 十/四 混淆容錯(shí/sì 是中文 ASR 最常見的錯)
 * 只要任一層解出正解就算答對。
 */

const CN_DIGIT: Record<string, number> = {
  零: 0, 〇: 0,
  一: 1, 壹: 1,
  二: 2, 兩: 2, 貳: 2,
  三: 3, 參: 3, 叁: 3,
  四: 4, 肆: 4,
  五: 5, 伍: 5,
  六: 6, 陸: 6,
  七: 7, 柒: 7,
  八: 8, 捌: 8,
  九: 9, 玖: 9,
}

const CN_CHAR_CLASS = /[零〇一壹二兩貳三參叁四肆五伍六陸七柒八捌九玖十拾]+/g

/**
 * 常見同音/近音誤辨字 → 數字字(同音節不分聲調)。
 * 單獨一個字的語音最容易被辨成非數字的中文字(九→就、五→我),
 * 這張表越廣,單字答案的存活率越高。
 */
const HOMOPHONE: Record<string, string> = {
  // ling → 零
  林: '零', 玲: '零', 靈: '零', 鈴: '零', 凌: '零', 陵: '零', 齡: '零', 領: '零', 嶺: '零',
  // yi → 一
  醫: '一', 衣: '一', 依: '一', 伊: '一', 移: '一', 易: '一', 億: '一', 異: '一',
  以: '一', 已: '一', 意: '一', 義: '一', 藝: '一', 姨: '一', 疑: '一', 遺: '一', 乙: '一',
  // er → 二
  而: '二', 兒: '二', 耳: '二', 餌: '二', 爾: '二', 餓: '二',
  // san → 三
  山: '三', 傘: '三', 散: '三', 衫: '三',
  // si → 四
  司: '四', 思: '四', 私: '四', 死: '四', 似: '四', 寺: '四', 斯: '四', 絲: '四', 撕: '四', 嘶: '四', 飼: '四',
  // wu → 五
  我: '五', 舞: '五', 無: '五', 吳: '五', 武: '五', 午: '五', 烏: '五', 屋: '五',
  霧: '五', 誤: '五', 悟: '五', 物: '五', 勿: '五', 巫: '五',
  // liu → 六
  留: '六', 流: '六', 劉: '六', 柳: '六', 溜: '六', 瘤: '六', 榴: '六', 硫: '六', 路: '六', 綠: '六',
  // qi → 七
  吃: '七', 起: '七', 期: '七', 其: '七', 氣: '七', 旗: '七', 妻: '七', 棋: '七',
  齊: '七', 器: '七', 汽: '七', 騎: '七', 欺: '七', 漆: '七', 泣: '七',
  // ba → 八
  吧: '八', 把: '八', 爸: '八', 巴: '八', 拔: '八', 罷: '八', 壩: '八', 芭: '八', 疤: '八', 靶: '八',
  // jiu → 九
  就: '九', 酒: '九', 久: '九', 舊: '九', 救: '九', 糾: '九', 揪: '九', 究: '九', 灸: '九', 韭: '九',
  // shi → 十
  是: '十', 時: '十', 石: '十', 食: '十', 實: '十', 事: '十', 世: '十', 市: '十',
  室: '十', 式: '十', 視: '十', 試: '十', 師: '十', 施: '十', 詩: '十', 失: '十', 史: '十', 使: '十', 濕: '十', 屍: '十',
  // liang → 兩
  量: '兩', 亮: '兩', 涼: '兩', 梁: '兩', 良: '兩', 輛: '兩',
}

/** 先剝掉的贅詞(長的在前,避免被短的截斷) */
const FILLERS = ['答案應該是', '我覺得是', '答案是', '應該是', '我覺得', '答案', '就是', '等於', '大概', '嗯', '呃', '喔', '啊']

function stripFillers(text: string): string {
  let t = text
  for (const f of FILLERS) t = t.split(f).join(' ')
  return t
}

function mapHomophones(text: string): string {
  let out = ''
  for (const ch of text) out += HOMOPHONE[ch] ?? ch
  return out
}

/** 中文數字字串 → 數值,只涵蓋 0~99(答案最大 81) */
function cnToNumber(raw: string): number | null {
  const s = raw.replace(/拾/g, '十')
  if (!s) return null
  const idx = s.indexOf('十')
  if (idx === -1) {
    // 沒有「十」:逐字串接,例如「五六」→ 56(口語常省略「十」)
    let v = 0
    for (const ch of s) {
      const d = CN_DIGIT[ch]
      if (d === undefined) return null
      v = v * 10 + d
    }
    return v
  }
  const tensPart = s.slice(0, idx)
  const onesPart = s.slice(idx + 1)
  if (tensPart.length > 1 || onesPart.length > 1) return null
  const tens = tensPart === '' ? 1 : CN_DIGIT[tensPart]
  const ones = onesPart === '' ? 0 : CN_DIGIT[onesPart]
  if (tens === undefined || ones === undefined) return null
  return tens * 10 + ones
}

const MAX_WINDOW = 3 // 0~99 的中文讀法最長三個字(例:八十一)

/**
 * 在一段連續中文數字字元中找出「極大視窗」:本身可解析、
 * 且往左或往右多吃一個字就解析不了的子字串。
 * 這樣「七八五十六」會解出 56,而「四十二」不會誤生出 12。
 */
function maximalSpans(run: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (let i = 0; i < run.length; i++) {
    for (let j = i + 1; j <= Math.min(run.length, i + MAX_WINDOW); j++) {
      if (cnToNumber(run.slice(i, j)) === null) continue
      const leftExtend = i > 0 && cnToNumber(run.slice(i - 1, j)) !== null
      const rightExtend = j < run.length && cnToNumber(run.slice(i, j + 1)) !== null
      if (!leftExtend && !rightExtend) spans.push([i, j])
    }
  }
  return spans
}

function cnRuns(text: string): string[] {
  return [...text.matchAll(CN_CHAR_CLASS)].map((m) => m[0])
}

/** 從一段文字抽出所有候選數字(阿拉伯 + 中文極大視窗) */
export function extractCandidates(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\d+/g)) {
    out.push(parseInt(m[0], 10))
    // 同一個數字重複講(引擎黏成「66」)→ 也視為單一數字 6
    if (m[0].length > 1 && new Set(m[0]).size === 1) out.push(parseInt(m[0][0], 10))
  }
  for (const run of cnRuns(text)) {
    for (const [i, j] of maximalSpans(run)) {
      const v = cnToNumber(run.slice(i, j))
      if (v !== null) out.push(v)
    }
    // 中文版的重複講:「六六」→ 也視為 6
    if (run.length > 1 && new Set(run).size === 1 && CN_DIGIT[run[0]] !== undefined) {
      out.push(CN_DIGIT[run[0]])
    }
  }
  return out
}

/** 對一個視窗產生 十↔四 互換的所有變體(shí/sì 容錯) */
function shiSiVariants(win: string): string[] {
  let variants = ['']
  for (const ch of win) {
    const choices = ch === '十' || ch === '四' ? ['十', '四'] : [ch]
    variants = variants.flatMap((v) => choices.map((c) => v + c))
  }
  return variants
}

/** 第二層判斷的入口:這段 ASR 文字是否等於正解 */
export function isCorrect(text: string, answer: number): boolean {
  // 第 1 層:原文直接解析
  if (extractCandidates(text).includes(answer)) return true
  // 第 2 層:剝贅詞
  const stripped = stripFillers(text)
  if (extractCandidates(stripped).includes(answer)) return true
  // 第 3 層:同音字校正
  const mapped = mapHomophones(stripped)
  if (extractCandidates(mapped).includes(answer)) return true
  // 第 4 層:十/四 混淆容錯
  for (const run of cnRuns(mapped)) {
    for (const [i, j] of maximalSpans(run)) {
      for (const v of shiSiVariants(run.slice(i, j))) {
        if (cnToNumber(v) === answer) return true
      }
    }
  }
  return false
}

/** 給回饋畫面用:盡力解讀出玩家最可能說的數字 */
export function interpret(text: string): number | null {
  // 先用校正後的全文解讀(「我是六」→ 56),取最後一個數字(口訣的結尾才是答案)
  const mapped = extractCandidates(mapHomophones(stripFillers(text)))
  if (mapped.length) return mapped[mapped.length - 1]
  const direct = extractCandidates(text)
  if (direct.length) return direct[direct.length - 1]
  return null
}
