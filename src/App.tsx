import { useCallback, useEffect, useRef, useState } from 'react'
import { buildDeck, type Question } from './game/questions'
import { getTheme, getTimeLimit, CORRECT_PER_LEVEL, MAX_LIVES } from './game/levels'
import { isCorrect, interpret } from './game/parseAnswer'
import { useSpeech, speechSupported } from './speech/useSpeech'
import LevelBackground from './components/LevelBackground'
import { initAudio, playCorrect, playWrong, playLevelUp } from './audio/sfx'
import { loadBoard, recordScore, fmtDate, type Board } from './game/leaderboard'
import { Zy, ZY } from './components/Zy'

type Phase = 'idle' | 'show' | 'listen' | 'feedback' | 'levelup' | 'gameover'
type Mode = 'classic' | 'rush'

const RUSH_MS = 60_000
const RUSH_DECK_LEVEL = 3 // 極限模式固定考 2~9 全範圍
const RUSH_DECK_KEY = -1

interface Verdict {
  ok: boolean
  heard: string
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<Mode>('classic')
  const [level, setLevel] = useState(1)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0) // 經典模式:本關已答對題數
  const [lives, setLives] = useState(MAX_LIVES)
  const [question, setQuestion] = useState<Question | null>(null)
  const [transcript, setTranscript] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [limitMs, setLimitMs] = useState(1)
  const [rushRemaining, setRushRemaining] = useState(RUSH_MS)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [confirmHome, setConfirmHome] = useState(false)
  const [board, setBoard] = useState<Board>(() => loadBoard())
  const [lastRank, setLastRank] = useState<number | null>(null)
  const [showBoard, setShowBoard] = useState(false)

  const judgedRef = useRef(true)
  const listeningRef = useRef(false)
  const tickRef = useRef<number>(0)
  const deadlineRef = useRef(0)
  const rushDeadlineRef = useRef(0)
  const pausedRushRemainRef = useRef(0)
  const transcriptRef = useRef('')
  const altsRef = useRef<string[]>([]) // 整段語音的所有候選讀法
  const baseRef = useRef('') // 引擎靜音重啟時,保留之前聽到的內容
  const questionRef = useRef<Question | null>(null)
  const levelRef = useRef(1)
  levelRef.current = level
  const modeRef = useRef<Mode>('classic')
  const scoreRef = useRef(0)
  scoreRef.current = score
  const abortRef = useRef<() => void>(() => {})
  const deckRef = useRef<Question[]>([])
  const deckLevelRef = useRef(0)

  const supported = speechSupported()

  const judge = useCallback((ok: boolean, heard: string) => {
    if (judgedRef.current) return
    judgedRef.current = true
    listeningRef.current = false
    window.clearInterval(tickRef.current)
    abortRef.current()
    setVerdict({ ok, heard })
    if (ok) playCorrect()
    else playWrong()
    if (ok) {
      setScore((s) => s + 1)
      if (modeRef.current === 'classic') setStreak((s) => s + 1)
    } else if (modeRef.current === 'classic') {
      setLives((l) => l - 1)
    }
    setPhase('feedback')
  }, [])

  const { start, stop, abort } = useSpeech({
    onResult: (texts, _isFinal) => {
      if (judgedRef.current) return
      const full = texts.map((t) => baseRef.current + t)
      transcriptRef.current = full[0]
      altsRef.current = full
      setTranscript(full[0])
      const q = questionRef.current
      if (!q) return
      // 任一候選解讀出正解就立刻過,不必等倒數;
      // 解讀不出正解時不判錯——時間內可以重講一次
      if (full.some((t) => isCorrect(t, q.answer))) {
        judge(true, full[0])
      }
    },
    onEnd: () => {
      // 引擎因靜音自行結束:時間還沒到就重啟續聽,保留已聽到的內容
      if (!judgedRef.current && listeningRef.current) {
        baseRef.current = transcriptRef.current ? transcriptRef.current + ' ' : ''
        start()
      }
    },
  })
  abortRef.current = abort

  const nextQuestion = useCallback(() => {
    // 牌堆發完(或換了等級/模式)才重洗,一輪內保證不重複
    const deckKey = modeRef.current === 'rush' ? RUSH_DECK_KEY : levelRef.current
    if (deckLevelRef.current !== deckKey || deckRef.current.length === 0) {
      deckRef.current =
        modeRef.current === 'rush'
          ? buildDeck(RUSH_DECK_LEVEL, 11) // 極限模式不出個位數和 10 的答案,單音節太難辨識
          : buildDeck(levelRef.current)
      deckLevelRef.current = deckKey
    }
    // 下一張和上一題答案相同(例如 7×8 緊接 8×7)就先移到堆底
    const prev = questionRef.current
    let guard = deckRef.current.length
    while (prev && deckRef.current.length > 1 && guard-- > 0) {
      if (deckRef.current[0].answer !== prev.answer) break
      deckRef.current.push(deckRef.current.shift()!)
    }
    const q = deckRef.current.shift()!
    questionRef.current = q
    setQuestion(q)
    transcriptRef.current = ''
    altsRef.current = []
    baseRef.current = ''
    setTranscript('')
    setVerdict(null)
    judgedRef.current = true // show 階段尚不可判定
    setPhase('show')
  }, [])

  const startGame = useCallback(
    (m: Mode) => {
      initAudio() // 使用者手勢中解鎖音訊
      setMode(m)
      modeRef.current = m
      setLevel(1)
      levelRef.current = 1
      setScore(0)
      setStreak(0)
      setLives(MAX_LIVES)
      questionRef.current = null
      deckLevelRef.current = 0 // 強制重洗牌堆
      if (m === 'rush') {
        rushDeadlineRef.current = Date.now() + RUSH_MS
        setRushRemaining(RUSH_MS)
      }
      nextQuestion()
    },
    [nextQuestion],
  )

  // ── Home 鍵:警示彈窗 + 暫停 ──

  const requestHome = useCallback(() => {
    if (modeRef.current === 'rush') {
      pausedRushRemainRef.current = Math.max(0, rushDeadlineRef.current - Date.now())
    }
    judgedRef.current = true
    listeningRef.current = false
    window.clearInterval(tickRef.current)
    abortRef.current()
    setConfirmHome(true)
  }, [])

  const resumeGame = useCallback(() => {
    if (modeRef.current === 'rush') {
      rushDeadlineRef.current = Date.now() + pausedRushRemainRef.current
    }
    setConfirmHome(false) // 各 phase 的 effect 會自己重新啟動
  }, [])

  const goHome = useCallback(() => {
    setConfirmHome(false)
    setPhase('idle')
  }, [])

  // 題目亮相片刻後開始聽答
  useEffect(() => {
    if (phase !== 'show' || confirmHome) return
    const t = window.setTimeout(() => setPhase('listen'), mode === 'rush' ? 250 : 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, confirmHome])

  // 聽答:啟動辨識;經典模式再加上單題倒數
  useEffect(() => {
    if (phase !== 'listen' || confirmHome) return
    judgedRef.current = false
    listeningRef.current = true
    start()
    if (mode === 'classic') {
      const limit = getTimeLimit(levelRef.current) * 1000
      setLimitMs(limit)
      setRemaining(limit)
      deadlineRef.current = Date.now() + limit
      tickRef.current = window.setInterval(() => {
        const r = deadlineRef.current - Date.now()
        setRemaining(Math.max(0, r))
        if (r <= 0) judge(false, transcriptRef.current)
      }, 50)
      return () => window.clearInterval(tickRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, confirmHome])

  // 極限模式:60 秒全域倒數,跨題持續走
  useEffect(() => {
    if (mode !== 'rush' || confirmHome) return
    if (phase !== 'show' && phase !== 'listen' && phase !== 'feedback') return
    const iv = window.setInterval(() => {
      const r = rushDeadlineRef.current - Date.now()
      setRushRemaining(Math.max(0, r))
      if (r <= 0) {
        judgedRef.current = true
        listeningRef.current = false
        window.clearInterval(tickRef.current)
        abortRef.current()
        if (scoreRef.current > 0) {
          const { board: nb, rank } = recordScore('rush', scoreRef.current, levelRef.current)
          setBoard(nb)
          setLastRank(rank)
        } else {
          setLastRank(null)
        }
        setPhase('gameover')
      }
    }, 100)
    return () => window.clearInterval(iv)
  }, [mode, phase, confirmHome])

  // 極限模式:每答對 6 題,背景晉升一個境界
  useEffect(() => {
    if (mode !== 'rush' || phase === 'idle') return
    setLevel(1 + Math.floor(score / 6))
  }, [mode, phase, score])

  // 對錯回饋後,決定下一步
  useEffect(() => {
    if (phase !== 'feedback' || confirmHome) return
    const delay =
      mode === 'rush' ? (verdict?.ok ? 350 : 900) : verdict?.ok ? 950 : 1600
    const t = window.setTimeout(() => {
      if (mode === 'rush') {
        nextQuestion() // 答對馬上換下一題;時間到由全域倒數負責收場
        return
      }
      if (lives <= 0) {
        if (score > 0) {
          const { board: nb, rank } = recordScore('classic', score, levelRef.current)
          setBoard(nb)
          setLastRank(rank)
        } else {
          setLastRank(null)
        }
        setPhase('gameover')
      } else if (streak >= CORRECT_PER_LEVEL) {
        setLevel((l) => l + 1)
        setStreak(0)
        setPhase('levelup')
      } else {
        nextQuestion()
      }
    }, delay)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, confirmHome])

  // 升級轉場(經典模式)
  useEffect(() => {
    if (phase !== 'levelup' || confirmHome) return
    playLevelUp()
    const t = window.setTimeout(nextQuestion, 2000)
    return () => window.clearTimeout(t)
  }, [phase, confirmHome, nextQuestion])

  /** 經典:作答完畢|極限:跳過此題 */
  const submitNow = useCallback(() => {
    if (phase !== 'listen' || judgedRef.current) return
    listeningRef.current = false
    stop()
    const grace = modeRef.current === 'rush' ? 300 : 700
    window.setTimeout(() => {
      if (!judgedRef.current) {
        const q = questionRef.current
        const ok = !!q && altsRef.current.some((t) => isCorrect(t, q.answer))
        judge(ok, transcriptRef.current)
      }
    }, grace)
  }, [phase, stop, judge])

  const theme = getTheme(level)
  const inGame = phase === 'show' || phase === 'listen' || phase === 'feedback' || phase === 'levelup'
  const ringProgress =
    mode === 'rush' ? rushRemaining / RUSH_MS : limitMs > 0 ? remaining / limitMs : 0
  const ringLabel =
    mode === 'rush' ? String(Math.ceil(rushRemaining / 1000)) : (remaining / 1000).toFixed(1)

  if (!supported) {
    return (
      <div className="app" style={{ color: '#444' }}>
        <LevelBackground level={1} />
        <div className="card">
          <h1 className="title">九九・聲之谷</h1>
          <p>這個瀏覽器不支援語音辨識(Web Speech API)。</p>
          <p>請改用 Chrome、Edge 或 Safari 開啟。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app" style={{ color: theme.text }}>
      <LevelBackground level={level} />

      {inGame && (
        <header className="hud">
          <div className="hud-item">
            <button className="home-btn" onClick={requestHome} aria-label="返回首頁">
              ⌂
            </button>
            Lv.{level}
            <span className="hud-sub">{theme.name}</span>
          </div>
          {mode === 'classic' ? (
            <div className="hud-item dots">
              {Array.from({ length: CORRECT_PER_LEVEL }, (_, i) => (
                <span key={i} className={`dot ${i < streak ? 'on' : ''}`} />
              ))}
            </div>
          ) : (
            <div className="hud-item rush-timer">⏱ {Math.ceil(rushRemaining / 1000)}s</div>
          )}
          {mode === 'classic' ? (
            <div className="hud-item hearts">
              {'♥'.repeat(lives)}
              <span className="heart-off">{'♥'.repeat(Math.max(0, MAX_LIVES - lives))}</span>
            </div>
          ) : (
            <div className="hud-item">{score} 題</div>
          )}
        </header>
      )}

      {phase === 'idle' && (
        <div className="card enter">
          <h1 className="title">
            <Zy t={ZY.title} />
          </h1>
          <p className="subtitle">
            <Zy t={ZY.subtitle} />
          </p>
          <div className="mode-list">
            <button className="primary" onClick={() => startGame('classic')}>
              <Zy t={ZY.classic} />
            </button>
            <p className="mode-desc">
              <Zy t={ZY.classicDesc} />
              {board.classic[0] && <> ・ 最高 {board.classic[0].score} 題</>}
            </p>
            <button className="primary rush-btn" onClick={() => startGame('rush')}>
              <Zy t={ZY.rush} />
            </button>
            <p className="mode-desc">
              <Zy t={ZY.rushDesc} />
              {board.rush[0] && <> ・ 最高 {board.rush[0].score} 題</>}
            </p>
          </div>
          <button className="ghost" onClick={() => setShowBoard(true)}>
            🏆 <Zy t={ZY.board} />
          </button>
          <p className="hint">
            <Zy t={ZY.hint} />
          </p>
        </div>
      )}

      {(phase === 'show' || phase === 'listen' || phase === 'feedback') && question && (
        <div className="card enter" key={`${question.a}x${question.b}-${score}-${lives}`}>
          <div className="question">
            {question.a} × {question.b}
          </div>

          {phase === 'listen' && (
            <>
              <div className="ring-wrap">
                <svg viewBox="0 0 120 120" className="ring">
                  <circle cx="60" cy="60" r="52" className="ring-track" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="ring-fill"
                    style={{
                      strokeDasharray: 2 * Math.PI * 52,
                      strokeDashoffset: 2 * Math.PI * 52 * (1 - ringProgress),
                    }}
                  />
                </svg>
                <div className="ring-num">{ringLabel}</div>
              </div>
              <div className="transcript">{transcript || '請說出答案⋯'}</div>
              <button className="primary" onClick={submitNow}>
                {mode === 'rush' ? '跳過此題 →' : '✓ 作答完畢'}
              </button>
            </>
          )}

          {phase === 'show' && <div className="transcript">準備⋯</div>}

          {phase === 'feedback' && verdict && (
            <div className={`verdict ${verdict.ok ? 'ok' : 'no'}`}>
              <div className="verdict-mark">{verdict.ok ? '◯' : '✕'}</div>
              {verdict.heard ? (
                <div className="verdict-heard">
                  聽到:「{verdict.heard.trim()}」
                  {!verdict.ok && interpret(verdict.heard) !== null && (
                    <> → 解讀為 {interpret(verdict.heard)}</>
                  )}
                </div>
              ) : (
                <div className="verdict-heard">沒有聽到答案</div>
              )}
              {!verdict.ok && (
                <div className="verdict-answer">
                  正解 {question.a} × {question.b} = {question.answer}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {phase === 'levelup' && (
        <div className="card enter levelup">
          <div className="levelup-badge">▲</div>
          <h2>登上 Lv.{level}</h2>
          <p className="subtitle">
            {theme.name} ・ 每題 {getTimeLimit(level)} 秒
          </p>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="card enter">
          <h1 className="title">{mode === 'rush' ? '時間到' : '旅程結束'}</h1>
          <p className="gameover-stat">
            {mode === 'rush' ? (
              <>60 秒內答對 {score} 題</>
            ) : (
              <>
                抵達 Lv.{level} ・ 共答對 {score} 題
              </>
            )}
          </p>
          {lastRank === 1 && <p className="best">★ 新紀錄!</p>}
          {lastRank !== null && lastRank > 1 && <p className="best">排行榜 第 {lastRank} 名</p>}
          {board[mode].length > 0 && (
            <ol className="board-list small">
              {board[mode].slice(0, 5).map((e, i) => (
                <li key={e.date + i} className={lastRank === i + 1 ? 'me' : ''}>
                  <span className="board-rank">{i + 1}</span>
                  <span>{e.score} 題</span>
                  <span className="board-date">{fmtDate(e.date)}</span>
                </li>
              ))}
            </ol>
          )}
          <button className="primary" onClick={() => startGame(mode)}>
            再挑戰一次
          </button>
          <button className="ghost" onClick={goHome}>
            回首頁
          </button>
        </div>
      )}

      {showBoard && (
        <div className="overlay" onClick={() => setShowBoard(false)}>
          <div className="card board enter" onClick={(e) => e.stopPropagation()}>
            <h2 className="confirm-title">🏆 排行榜</h2>
            <div className="board-cols">
              {(['classic', 'rush'] as const).map((m) => (
                <div key={m} className="board-col">
                  <h3>{m === 'classic' ? '經典' : '極限 60s'}</h3>
                  {board[m].length === 0 ? (
                    <p className="board-empty">尚無紀錄</p>
                  ) : (
                    <ol className="board-list">
                      {board[m].map((e, i) => (
                        <li key={e.date + i}>
                          <span className="board-rank">{i + 1}</span>
                          <span>{e.score} 題</span>
                          <span className="board-date">{fmtDate(e.date)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
            <button className="ghost" onClick={() => setShowBoard(false)}>
              關閉
            </button>
          </div>
        </div>
      )}

      {confirmHome && (
        <div className="overlay">
          <div className="card confirm enter">
            <p className="confirm-title">要返回首頁嗎?</p>
            <p className="subtitle">目前的進度會消失,不會留下紀錄。</p>
            <div className="confirm-row">
              <button className="ghost" onClick={resumeGame}>
                繼續遊戲
              </button>
              <button className="primary" onClick={goHome}>
                返回首頁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
