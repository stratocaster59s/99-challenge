/**
 * 本地排行榜,存在 localStorage(同一個網址下重啟瀏覽器/電腦都會保留)。
 * 每個模式各保留前 10 名。
 */

export type BoardMode = 'classic' | 'rush'

export interface BoardEntry {
  score: number
  level: number
  date: string // ISO
}

export interface Board {
  classic: BoardEntry[]
  rush: BoardEntry[]
}

const KEY = '99-leaderboard'
const MAX_ENTRIES = 10

export function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const b = JSON.parse(raw)
      return { classic: b.classic ?? [], rush: b.rush ?? [] }
    }
  } catch {
    /* 壞資料就重來 */
  }
  return { classic: [], rush: [] }
}

/** 寫入一場成績,回傳新榜單與本場名次(沒進前 10 則為 null) */
export function recordScore(
  mode: BoardMode,
  score: number,
  level: number,
): { board: Board; rank: number | null } {
  const board = loadBoard()
  const entry: BoardEntry = { score, level, date: new Date().toISOString() }
  const list = [...board[mode], entry]
  // 同分時,較早達成的排前面
  list.sort((a, b) => b.score - a.score || Date.parse(a.date) - Date.parse(b.date))
  const idx = list.indexOf(entry)
  board[mode] = list.slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(KEY, JSON.stringify(board))
  } catch {
    /* 寫不進去就算了,不影響遊戲 */
  }
  return { board, rank: idx < MAX_ENTRIES ? idx + 1 : null }
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}
