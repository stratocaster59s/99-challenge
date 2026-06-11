import { useCallback, useEffect, useRef } from 'react'

interface Handlers {
  /**
   * 每次辨識更新都會呼叫。
   * texts 是「整段語音的多個候選讀法」(第 0 個是引擎最有把握的);
   * 單字答案常常只在第 2、3 候選裡才是正確的數字,所以全部都要檢查。
   */
  onResult: (texts: string[], isFinal: boolean) => void
  /** 辨識引擎自行結束時呼叫(例如靜音逾時) */
  onEnd?: () => void
}

const MAX_ALTERNATIVES = 5

function getSR(): any {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && !!getSR()
}

export function useSpeech(handlers: Handlers) {
  const recRef = useRef<any>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const teardown = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    rec.onresult = null
    rec.onend = null
    rec.onerror = null
    try {
      rec.abort()
    } catch {
      /* already stopped */
    }
    recRef.current = null
  }, [])

  /** 重新開始一輪辨識(會先丟棄前一輪) */
  const start = useCallback(() => {
    teardown()
    const SR = getSR()
    if (!SR) return
    const rec = new SR()
    rec.lang = 'zh-TW'
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = MAX_ALTERNATIVES
    rec.onresult = (e: any) => {
      // 把每個分段的第 k 個候選串起來,組成整段的第 k 個候選
      const texts: string[] = []
      for (let k = 0; k < MAX_ALTERNATIVES; k++) {
        const parts: string[] = []
        for (let i = 0; i < e.results.length; i++) {
          const seg = e.results[i]
          parts.push(seg[Math.min(k, seg.length - 1)].transcript)
        }
        // 分段之間補空格,避免兩次發話被黏成一個數字(「6」+「6」→「66」)
        const t = parts.join(' ').trim()
        if (t && !texts.includes(t)) texts.push(t)
      }
      let isFinal = false
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) isFinal = true
      }
      if (texts.length) handlersRef.current.onResult(texts, isFinal)
    }
    rec.onend = () => {
      if (recRef.current === rec) {
        recRef.current = null
        handlersRef.current.onEnd?.()
      }
    }
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        alert('需要麥克風權限才能玩,請允許後重新整理。')
      }
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      /* start 連點時可能丟 InvalidStateError,忽略 */
    }
  }, [teardown])

  /** 溫和結束:讓引擎把最後一段話定稿後再觸發 onresult(isFinal) */
  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  /** 立刻丟棄,不再回傳任何結果 */
  const abort = useCallback(() => {
    teardown()
  }, [teardown])

  useEffect(() => () => teardown(), [teardown])

  return { start, stop, abort }
}
