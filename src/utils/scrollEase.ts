/**
 * 右侧栏跟着正文滚时的缓动 —— 自己按帧逼近目标，不用浏览器的 `behavior: 'smooth'`。
 *
 * ## 为什么不用原生平滑
 *
 * 第七十三节试过：跟随每 120ms 就可能来一次，而一次原生平滑滚动要三四百毫秒，
 * 后一次在前一次没走完时又发起，动画反复被重定向 —— 表现是「竖线在动、列表却没跟上」。
 * 于是改成瞬时定位，代价是列表一格一格跳（用户 2026-09-08：「滚动并不流畅」）。
 *
 * 这里的做法没有那个毛病：目标随时能换，换了也不重启 —— 每一帧只看「现在离目标还有多远」，
 * 走掉其中一部分。目标连着变时曲线是连续的，正文滚得快列表就追得快。
 *
 * ## 指数逼近
 *
 * 每帧 `cur += (target - cur) * (1 - e^(-dt/τ))`。τ 是时间常数：
 * 过 τ 走完 63%，过 3τ 走完 95%。取 160ms —— 比上报间隔（120ms）稍长，
 * 于是两次上报之间基本追到位、又不至于一步到位看着像瞬时。
 * 用 dt 算而不是固定比例，掉帧时每帧走得多、不会因为卡顿而变慢。
 *
 * 离目标不到半个像素就直接落到目标上收尾 —— 指数逼近永远到不了终点，得有个截止。
 */

/** 时间常数（毫秒）。见文件头 */
export const FOLLOW_TAU_MS = 160

/** 收尾门槛：离目标不到这个数就直接落上去 */
const SNAP_PX = 0.5

/**
 * 把一张卡摆到滚动容器正中时，容器该滚到哪。
 *
 * @param itemTop      这张卡的上沿在滚动坐标里的位置（容器内容顶部为 0）
 * @param itemHeight   这张卡的高度
 * @param viewHeight   容器可视高度
 * @param scrollHeight 容器内容总高度
 * @returns 夹在 [0, 能滚到的最大值] 里的目标 scrollTop
 */
export function centerTarget(
  itemTop: number,
  itemHeight: number,
  viewHeight: number,
  scrollHeight: number
): number {
  const max = Math.max(0, scrollHeight - viewHeight)
  const want = itemTop - (viewHeight - itemHeight) / 2
  return Math.min(max, Math.max(0, want))
}

/**
 * 这一帧该走到哪。
 *
 * @param current 现在在哪
 * @param target  要去哪
 * @param dtMs    离上一帧过了多久
 * @param tauMs   时间常数
 * @returns 下一帧的位置；够近了就正好是 target
 */
export function approach(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number = FOLLOW_TAU_MS
): number {
  const diff = target - current
  if (Math.abs(diff) < SNAP_PX) return target
  const next = current + diff * (1 - Math.exp(-Math.max(0, dtMs) / tauMs))
  // 走完这一步已经够近了，也直接落上去，省掉最后几帧肉眼看不出的微动
  return Math.abs(target - next) < SNAP_PX ? target : next
}

/**
 * 驱动一个滚动容器按上面的曲线追目标。
 *
 * - `to()`：换目标。没在动就起一条 rAF 循环，在动就只换目标、循环接着跑
 * - `cancel()`：停下，容器留在当前位置。用户一碰列表就该调它，否则手指和动画会打架
 *
 * 一个实例管一个容器；容器换了（切标签时 `<ul>` 会换）就传新的进来。
 */
export class ScrollEaser {
  private el: HTMLElement | null = null
  private target = 0
  private raf = 0
  private last = 0

  to(el: HTMLElement, target: number): void {
    this.el = el
    this.target = target
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  cancel(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /** 在动吗（给测试和读数用） */
  get running(): boolean {
    return this.raf !== 0
  }

  private tick = (now: number): void => {
    this.raf = 0
    const el = this.el
    if (!el) return
    const dt = now - this.last
    this.last = now
    const next = approach(el.scrollTop, this.target, dt)
    el.scrollTop = next
    if (next === this.target) return
    this.raf = requestAnimationFrame(this.tick)
  }
}
