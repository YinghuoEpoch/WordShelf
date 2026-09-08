/**
 * 侧栏开合那 200ms 的读数。
 *
 * 起因（2026-09-07，平板）：长文档里单独开合右侧栏有概率卡顿，卡顿还会让
 * 「笔记」键抢在侧栏收完之前冒出来。成因有三个候选，一个个猜太贵，
 * 和第四十九、五十七、六十七节同一招 —— **先加一屏读数，一轮定案**：
 *
 * 1. **重新断行**：正文宽度跟着侧栏变，每变一次全篇几千个 span 重新排版
 *    （第七十七节量过单帧最长 84.5ms，一帧预算 16.7ms）。看「帧数 / 应有帧数」和「最长一帧」
 * 2. **系统栏动画**：宽屏两栏都收起就进沉浸，安卓播系统栏动画会把 WebView 卡住
 *    （第七十八节量到过）。看「系统栏调用」
 * 3. **「屏幕上最后一个词」的计算**：笔记栏开着时每滚一次就从头逐段问位置，
 *    动画期间布局每帧都脏，它会强迫同步重排。看「锚点计算」
 *
 * 这个文件只管**存数和算数**，不碰 DOM；量的动作在 useRightPanelTransition 里。
 * 设置 → 开发者 → 侧栏过渡参数 显示它。
 */

/** 一次开合量到的东西 */
export interface PanelTransitionRecord {
  /** 这次是打开还是收起 */
  open: boolean
  /** 从状态翻转到过渡真正结束，实际用了多久（毫秒） */
  durationMs: number
  /** 期间画了几帧（requestAnimationFrame 触发的次数） */
  frames: number
  /** 相邻两帧之间最长的一次间隔（毫秒）。一帧预算 16.7ms，远超就是卡在这一帧 */
  longestFrameMs: number
  /** 期间 setSystemBarsHidden 被调了几次 */
  systemBarCalls: number
  /** 期间「屏幕上最后一个词」算了几次 */
  anchorCalcs: number
  /** 怎么结束的：等到了动画结束，还是兜底超时 */
  endedBy: 'animationend' | 'timeout'
  /**
   * 正文落点的公式和实测差了几像素（实测 − 公式）。
   * 开合时正文用位移平滑滑到「重排之后会在的位置」，那个位置是算出来的（proseLeftFor），
   * 这一格就是验算：不为 0 说明公式漏了什么（滚动条？内边距？）。没找到正文时不记。
   */
  landingErrorPx?: number
  /**
   * 重排后把屏幕顶端那个词拉回原高度，拉了几像素。
   * 浏览器的滚动锚定在这一帧被位移的变化关掉了（第七十九节的根子），所以自己拉；
   * 这一格就是浏览器欠下的那笔。没找到正文或顶端词时不记。
   */
  anchorFixPx?: number
  /** 什么时候（Date.now()） */
  at: number
}

/** 一帧的预算（60Hz） */
export const FRAME_BUDGET_MS = 1000 / 60

/** 留最近这么多条 */
export const MAX_RECORDS = 10

/**
 * 两个计数器。**只在这里加**，量的时候比前后差值 ——
 * 比往调用方塞回调省事，也不用担心谁忘了解绑。
 */
const counters = { systemBars: 0, anchorCalcs: 0 }

/** setSystemBarsHidden 每调一次记一笔（safeArea.ts 里调） */
export function countSystemBarCall(): void {
  counters.systemBars += 1
}

/** 「屏幕上最后一个词」每算一次记一笔（LyricEditor 里调） */
export function countAnchorCalc(): void {
  counters.anchorCalcs += 1
}

/** 此刻两个计数器的值。量之前拍一张，量完再拍一张，差值就是期间发生的次数 */
export function snapshotCounters(): { systemBars: number; anchorCalcs: number } {
  return { ...counters }
}

let records: PanelTransitionRecord[] = []

/** 存一条，最新的在前，超过 MAX_RECORDS 的丢掉 */
export function recordPanelTransition(r: PanelTransitionRecord): void {
  records = [r, ...records].slice(0, MAX_RECORDS)
}

/** 最近的几条，最新的在前 */
export function getPanelTransitions(): PanelTransitionRecord[] {
  return records
}

/** 测试用：清空 */
export function resetPanelTransitions(): void {
  records = []
  counters.systemBars = 0
  counters.anchorCalcs = 0
}

/**
 * 这段时间按 60Hz 本该画几帧。
 * 过渡 200ms 应有 12 帧；只画了 3 帧就是掉了 9 帧，肉眼看到的就是「卡」。
 */
export function expectedFrames(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / FRAME_BUDGET_MS))
}

/**
 * 把「帧数 / 应有帧数」和「最长一帧」合成一句结论，让不看数的人也能读懂。
 *
 * 阈值定得粗：掉一半以上帧、或者有一帧超过三个预算，就叫「卡」。
 * 这是给人看的标签，不参与任何逻辑。
 */
export function judgeSmoothness(r: Pick<PanelTransitionRecord, 'durationMs' | 'frames' | 'longestFrameMs'>): '顺' | '略卡' | '卡' {
  const expected = expectedFrames(r.durationMs)
  const dropped = expected - r.frames
  if (r.longestFrameMs > FRAME_BUDGET_MS * 3 || dropped >= expected / 2) return '卡'
  if (r.longestFrameMs > FRAME_BUDGET_MS * 1.5 || dropped >= 2) return '略卡'
  return '顺'
}

/**
 * 从 rAF 的时间戳序列算出帧数和最长间隔。
 * 第一段间隔从「翻转那一刻」算起 —— 翻转后迟迟画不出第一帧，本身就是卡。
 */
export function summarizeFrames(startAt: number, frameTimes: number[]): { frames: number; longestFrameMs: number } {
  let longest = 0
  let prev = startAt
  for (const t of frameTimes) {
    longest = Math.max(longest, t - prev)
    prev = t
  }
  return { frames: frameTimes.length, longestFrameMs: longest }
}

/**
 * 正文块在阅读容器里的左边距（像素）。
 *
 * 正文是 `max-w-prose mx-auto`、`box-sizing: border-box`：块宽 = min(最大宽, 容器宽)，
 * 剩下的空间左右平分。开合侧栏时容器宽会变 ±侧栏宽，这个式子算出变完之后正文在哪，
 * 动画期间用位移把它平滑送过去，到位那一刻再真正重排 —— 于是重排只发生一次。
 *
 * ⚠️ 不写死任何数：最大宽从 getComputedStyle 读（65ch 折成像素），容器宽当场量。
 * 第七十七节里写死 616 被用户当场指出来过。
 */
export function proseLeftFor(containerWidth: number, maxWidth: number): number {
  const block = Math.min(maxWidth, containerWidth)
  return Math.max(0, (containerWidth - block) / 2)
}
