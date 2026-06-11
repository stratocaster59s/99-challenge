export interface Theme {
  name: string
  sky: [string, string]
  far: string
  near: string
  accent: string
  text: string
  stars: boolean
}

const THEMES: Theme[] = [
  { name: '黎明峽谷', sky: ['#ffc59e', '#b9a7e6'], far: '#cf93b0', near: '#8d6bb8', accent: '#fff3d6', text: '#503a63', stars: false },
  { name: '蜜桃神殿', sky: ['#ffe3c8', '#ffd2b0'], far: '#f0a489', near: '#cf7460', accent: '#fffaf0', text: '#6e4234', stars: false },
  { name: '青瓷水都', sky: ['#c8ecdc', '#6d8fc4'], far: '#83bcab', near: '#477390', accent: '#f3fff7', text: '#1f3f56', stars: false },
  { name: '黃昏迴廊', sky: ['#f7b2a0', '#6b4a8f'], far: '#b06a92', near: '#583672', accent: '#ffd9a0', text: '#fdf0ff', stars: false },
  { name: '星夜高塔', sky: ['#33437c', '#171030'], far: '#3d3566', near: '#221a42', accent: '#ece8ff', text: '#ece8ff', stars: true },
]

export function getTheme(level: number): Theme {
  if (level <= THEMES.length) return THEMES[level - 1]
  // 第六關之後:色相每關旋轉 37°,程序化生成
  const h = (200 + level * 37) % 360
  return {
    name: `第 ${level} 境`,
    sky: [`hsl(${h}, 62%, 76%)`, `hsl(${(h + 55) % 360}, 46%, 42%)`],
    far: `hsl(${(h + 28) % 360}, 36%, 56%)`,
    near: `hsl(${(h + 28) % 360}, 38%, 36%)`,
    accent: `hsl(${(h + 180) % 360}, 85%, 93%)`,
    text: level % 2 === 0 ? '#f4f1ff' : '#33304d',
    stars: level % 2 === 0,
  }
}

/** 每題作答秒數:8 → 7 → 6 → 5 → 4.5,之後每關 -0.4,下限 2.5 */
export function getTimeLimit(level: number): number {
  const table = [8, 7, 6, 5, 4.5]
  if (level <= table.length) return table[level - 1]
  return Math.max(2.5, 4.5 - 0.4 * (level - 5))
}

export const CORRECT_PER_LEVEL = 10
export const MAX_LIVES = 3
