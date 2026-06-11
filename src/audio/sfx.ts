/**
 * 用 Web Audio 即時合成音效,不需要任何音檔。
 * AudioContext 必須在使用者手勢(按「開始挑戰」)後建立才能出聲。
 */

let ctx: AudioContext | null = null

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** 在使用者點擊時呼叫一次,解鎖音訊 */
export function initAudio() {
  ensure()
}

function note(
  c: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(peak, at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

/** 答對:清亮的大三和弦鈴聲 + 高八度泛音 */
export function playCorrect() {
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  note(c, 523.25, t, 0.5, 'triangle', 0.22) // C5
  note(c, 659.25, t + 0.07, 0.5, 'triangle', 0.2) // E5
  note(c, 783.99, t + 0.14, 0.7, 'triangle', 0.18) // G5
  note(c, 1567.98, t + 0.14, 0.9, 'sine', 0.07) // G6 泛音
}

/** 答錯:低音半音下行,悶悶的 */
export function playWrong() {
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  note(c, 196.0, t, 0.3, 'sawtooth', 0.1) // G3
  note(c, 185.0, t + 0.13, 0.45, 'sawtooth', 0.1) // F#3
}

/** 升級:上行琶音 + 頂端閃光 */
export function playLevelUp() {
  const c = ensure()
  if (!c) return
  const t = c.currentTime
  const seq = [392.0, 523.25, 659.25, 783.99, 1046.5] // G4 C5 E5 G5 C6
  seq.forEach((f, i) => note(c, f, t + i * 0.09, 0.55, 'triangle', 0.16))
  note(c, 2093.0, t + 0.45, 1.1, 'sine', 0.05)
}
