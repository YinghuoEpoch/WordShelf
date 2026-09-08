/**
 * 顶栏进出文档流那一下的读数（第八十一节 B 的诊断）。
 *
 * 平板上「正文在屏幕上不动」验过没问题，手机上反复点空白进出沉浸却还会上下抖。
 * 从代码上推不出差别（阅读那一列只用稳定的 --sa-top-real），所以照老规矩加读数：
 * 翻转那一趟补偿了多少，之后 150 / 500 / 1200ms 再各采一次样 ——
 * 看是不是有东西在 React 之外把正文挪了（原生推留白、WebView 整体上移、滚动被夹）。
 *
 * 只管存数，量的动作在 LyricEditor 里。设置 → 开发者 → 顶栏进出参数 显示。
 */

/** 翻转之后某一刻的样子 */
export interface ChromeShiftSample {
  /** 翻转后多少毫秒采的 */
  afterMs: number
  /** 正文容器上沿在屏幕上的位置 */
  containerTop: number
  /** 翻转时屏幕顶端那个词，此刻在屏幕上的高度。理想是一直不变 */
  wordY: number | null
  scrollTop: number
  /** window.innerHeight —— WebView 被系统栏推着变大变小会在这里露出来 */
  innerHeight: number
  /** 此刻的 --sa-top / --sa-top-real */
  saTop: string
  saTopReal: string
}

export interface ChromeShiftRecord {
  at: number
  /** 这次是进沉浸（顶栏走）还是出沉浸（顶栏回） */
  immersive: boolean
  /** 上一次提交完成时容器上沿在哪、这次在哪、于是补了多少 */
  prevTop: number
  newTop: number
  applied: number
  scrollBefore: number
  scrollAfter: number
  /** 翻转时屏幕顶端那个词 */
  wordId: string | null
  samples: ChromeShiftSample[]
}

export const MAX_CHROME_SHIFTS = 8

let records: ChromeShiftRecord[] = []

export function recordChromeShift(r: ChromeShiftRecord): void {
  records = [r, ...records].slice(0, MAX_CHROME_SHIFTS)
}

export function getChromeShifts(): ChromeShiftRecord[] {
  return records
}

export function resetChromeShifts(): void {
  records = []
}
