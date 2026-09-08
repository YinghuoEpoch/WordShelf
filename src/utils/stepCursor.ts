/**
 * 右侧栏的竖线一张卡一张卡地走，不跳。
 *
 * ## 为什么
 *
 * 竖线的落点（findFollowIndex）是**算**出来的：屏幕上最后一个笔记是第几条。
 * 好几条笔记挤在同一行或挨得很近时，正文滚一下、一次上报就能越过好几条 ——
 * 竖线从第 5 条直接跳到第 9 条，中间四条压根没亮过。列表的缓动（scrollEase.ts）
 * 只抹平了位移，竖线本身还是跳的。用户 2026-09-08 提的：
 * 「让右侧栏标记的滚动必须一个一个笔记卡片地滚动，哪怕我正文划到了它还在滚都行，
 * 当然离得远了还是要滚快一点，离得近可以滚缓一点。」
 *
 * ## 做法
 *
 * 这里维护一个「显示中的那条」，朝目标**每次只挪一格**；两格之间隔多久看还差几格：
 * 差得远走得快、差得近走得慢（`stepDelay`）。目标随时换 —— 正文往回滚就往回走。
 *
 * 差得再远也**不跳过**（用户定的）。要是日后甩过几百条嫌它追太久，
 * 再加「差太远直接跳」的门槛，别现在就加。
 *
 * ## 目标换了，已经在等的那一步怎么办
 *
 * 不重头等。目标一换就按新距离重算这一步该在哪一刻落下：比原定的**早**就提前，
 * 比原定的晚就维持原定 —— 于是正文一直在滚时，竖线的步子只会越来越快，不会被每次上报打断。
 */

/** 只差一格时，一步隔多久 —— 慢，让人看清它是一张张过的 */
export const STEP_NEAR_MS = 240
/** 差得远时一步最快隔多久 —— 每秒约 16 张 */
export const STEP_FAR_MS = 60

/**
 * 还差 `distance` 格时，下一步隔多久。
 * 1 格 240ms，2 格 120ms，3 格 80ms，4 格起一律 60ms。
 */
export function stepDelay(distance: number): number {
  const d = Math.max(1, Math.abs(distance))
  return Math.max(STEP_FAR_MS, Math.min(STEP_NEAR_MS, STEP_NEAR_MS / d))
}

/**
 * 驱动「显示中的那条」朝目标一格一格走。
 *
 * - `setTarget(i)`：换目标。在等的那一步按新距离重算落下的时刻（只会提前不会推迟）
 * - `jump(i)`：直接到 i，目标也设成 i。打开这一栏 / 切标签 / 换文档 / 刚划完 / 点了卡跳转用它
 * - `cancel()`：停下，留在当前那条
 *
 * 每挪一格调一次 `onChange`。`jump` 到别处也会调；已经在那儿就不调。
 */
export class StepCursor {
  private shown: number
  private target: number
  private timer: ReturnType<typeof setTimeout> | null = null
  /** 在等的这一步是什么时候开始等的、打算等多久 */
  private startedAt = 0
  private delay = 0

  constructor(
    private readonly onChange: (index: number) => void,
    initial = -1,
    private readonly now: () => number = () => Date.now()
  ) {
    this.shown = initial
    this.target = initial
  }

  get current(): number {
    return this.shown
  }

  setTarget(index: number): void {
    // 还没有过位置（-1）就没有「一格格走」可言，直接落上去
    if (this.shown < 0) {
      this.jump(index)
      return
    }
    this.target = index
    this.schedule()
  }

  jump(index: number): void {
    this.cancel()
    this.target = index
    if (this.shown === index) return
    this.shown = index
    this.onChange(index)
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    const distance = this.target - this.shown
    if (distance === 0) {
      this.cancel()
      return
    }
    const delay = stepDelay(distance)
    const now = this.now()
    if (this.timer !== null) {
      // 已经在等：只提前，不推迟
      const fireAt = this.startedAt + delay
      if (fireAt >= this.startedAt + this.delay) return
      clearTimeout(this.timer)
      this.delay = delay
      this.timer = setTimeout(this.step, Math.max(0, fireAt - now))
      return
    }
    this.startedAt = now
    this.delay = delay
    this.timer = setTimeout(this.step, delay)
  }

  private step = (): void => {
    this.timer = null
    if (this.target === this.shown) return
    this.shown += Math.sign(this.target - this.shown)
    this.onChange(this.shown)
    this.schedule()
  }
}
