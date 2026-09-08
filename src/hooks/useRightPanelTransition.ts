import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { proseLeftFor, recordPanelTransition, snapshotCounters, summarizeFrames } from '../panelTransition'

/** 侧栏滑入滑出用多久。和从前 CSS 里的 duration-200 一样 */
export const PANEL_SLIDE_MS = 200
/** 和 Tailwind 的 ease-out 同一条曲线 */
const PANEL_EASING = 'cubic-bezier(0, 0, 0.2, 1)'

/**
 * 等不到动画结束时，最多等这么久就当结束。
 * 动画本身 200ms；主线程被卡到 finished 迟迟不兑现，本来就是要量的东西。
 */
export const SETTLE_FALLBACK_MS = 1000

/** 正文块身上的标记。LyricEditor 渲染时挂上，这里靠它找到要滑的那一块 */
export const PROSE_SELECTOR = '[data-reader-prose]'

export interface RightPanelTransition {
  /**
   * 侧栏此刻是不是**滑到位了**。翻转 `open` 的那一刻变 false，
   * 等到滑入滑出的动画真正结束（或兜底超时）才回到 true。
   *
   * 「笔记」键只在 settled 之后才露出来 —— 缘由见 App.tsx 那颗键上的注释。
   */
  settled: boolean
  /**
   * 中间那层此刻该不该**占位**（宽度 = 侧栏宽）。
   * 打开：动画期间不占位（侧栏盖在正文上滑进来），滑到位那一刻才占位 —— 重排一次；
   * 收起：翻转那一刻就不占位 —— 重排一次，然后侧栏从原位滑出去。
   * 见文件末尾「为什么这样安排」。
   */
  laidOut: boolean
  /** 挂在锁着完整宽度的那一层（侧栏真正的内容）上，滑入滑出就是动它 */
  panelRef: (el: HTMLDivElement | null) => void
}

type Phase = 'idle' | 'opening' | 'closingPending' | 'closing'

interface Run {
  open: boolean
  startAt: number
  frameTimes: number[]
  counters: { systemBars: number; anchorCalcs: number }
  raf: number
  timeout: ReturnType<typeof setTimeout>
  animations: Animation[]
  /** 开：滑完之后重排，落点公式算出来的值，到位后和实测比 */
  predictedLeft: number | null
  /** 关：翻转那一刻就重排了，公式和实测当场比出来的差 */
  landingErrorPx?: number
  /** 兜底超时先到了就记在这，收尾时照实写进读数 */
  endedBy: 'animationend' | 'timeout'
}

/** 正文块和它的滚动容器。编辑全文、没打开文档时都没有，那就只滑侧栏、不滑正文 */
function findProse(): { prose: HTMLElement; container: HTMLElement } | null {
  const prose = document.querySelector<HTMLElement>(PROSE_SELECTOR)
  const container = prose?.parentElement
  return prose && container ? { prose, container } : null
}

/** 正文块此刻的左边距（相对滚动容器，不含位移） */
function measuredLeft(prose: HTMLElement, container: HTMLElement): number {
  return prose.getBoundingClientRect().left - container.getBoundingClientRect().left
}

/** `max-w-prose` 折成像素之后是多少。读不到就当无穷大 —— 那样公式退化成「贴左」，落点差会在读数屏上暴露 */
function proseMaxWidth(prose: HTMLElement): number {
  const v = parseFloat(getComputedStyle(prose).maxWidth)
  return Number.isFinite(v) && v > 0 ? v : Number.POSITIVE_INFINITY
}

function slide(el: Element, fromPx: number, toPx: number): Animation {
  return el.animate(
    [{ transform: `translateX(${fromPx}px)` }, { transform: `translateX(${toPx}px)` }],
    { duration: PANEL_SLIDE_MS, easing: PANEL_EASING, fill: 'forwards' }
  )
}

/**
 * 右侧栏（宽屏）的开合动画，以及那 200ms 的读数。
 *
 * ## 为什么这样安排（2026-09-08，第八十节）
 *
 * 从前侧栏动画的是**宽度**，正文是 flex-1 跟着一起变。读数屏量到：长文档里每一帧都超预算，
 * 一半的帧没画出来 —— 容器宽度每变一次，整个正文列（几千个 span、两万多 px 高）
 * 就整个重排一次，**文字宽度不变的那段照样掉帧**。短文档一帧不掉，所以不是机器的锅。
 *
 * 现在动画只动 `transform`（合成层，不重排），重排只在一个时刻发生一次：
 *
 * - **打开**：中间层先不占位（宽度 0），侧栏内容从屏幕右边**盖着正文**滑进来；
 *   正文同时用位移平滑滑到「占位之后会在的位置」（proseLeftFor 算的）；
 *   滑到位那一刻中间层占位、位移归零 —— 重排一次，位置接得上，只有断行变了
 * - **收起**：翻转那一刻中间层就不占位 —— 重排一次；正文当场被摆到新位置，
 *   先用位移拉回旧位置再平滑滑到新位置；侧栏内容从原位滑出屏幕
 *
 * 两个方向不对称，是因为「先重排」只在收起时不会露馅：打开时先重排会让正文
 * 移到窄容器里、被滚动容器裁掉右边一截，而侧栏还没滑到那儿盖住。
 *
 * ⚠️ 打开的落点是**算**出来的（收起的是量出来的）。读数屏上「落点偏差」就是验算：
 * 到位后实测和公式差几像素。差得多就是公式漏了什么。
 *
 * 用 Web Animations 而不是 CSS transition：两层状态要在同一帧里一起切、
 * 而且切的时候不能有过渡 —— 用 CSS 得插「关过渡的一帧」，容易漏；`animate()` 的
 * `finished` 也比 transitionend 可靠。
 *
 * ⚠️ 中间层**不裁剪**了（从前 overflow-hidden）：动画期间内容要盖到正文上。
 * 收着的时候内容在屏幕外，靠根节点的 clip 挡住 —— 根节点必须是 `overflow: clip`
 * 而不是 `hidden`，否则侧栏跟随那一句 scrollIntoView 会把整个 app 横着滚过去。
 *
 * ⚠️ 这个环境里验不了动画：面板隐藏时 rAF 不触发、动画不推进。逻辑靠读数屏在真机上验。
 */
export function useRightPanelTransition(open: boolean, enabled: boolean, width: number): RightPanelTransition {
  const [settled, setSettled] = useState(true)
  const [laidOut, setLaidOut] = useState(open)
  const panelEl = useRef<HTMLDivElement | null>(null)
  const panelRef = useCallback((el: HTMLDivElement | null) => {
    panelEl.current = el
  }, [])
  const phase = useRef<Phase>('idle')
  const runRef = useRef<Run | null>(null)
  const mounted = useRef(false)

  /** 一轮结束：记读数，回到 idle */
  const finish = useCallback((endedBy: 'animationend' | 'timeout') => {
    const run = runRef.current
    if (!run) return
    runRef.current = null
    phase.current = 'idle'
    cancelAnimationFrame(run.raf)
    clearTimeout(run.timeout)
    for (const a of run.animations) a.cancel()
    let landingErrorPx = run.landingErrorPx
    if (run.predictedLeft !== null) {
      const found = findProse()
      if (found) landingErrorPx = measuredLeft(found.prose, found.container) - run.predictedLeft
    }
    const after = snapshotCounters()
    recordPanelTransition({
      open: run.open,
      durationMs: performance.now() - run.startAt,
      ...summarizeFrames(run.startAt, run.frameTimes),
      systemBarCalls: after.systemBars - run.counters.systemBars,
      anchorCalcs: after.anchorCalcs - run.counters.anchorCalcs,
      endedBy,
      landingErrorPx,
      at: Date.now()
    })
    setSettled(true)
  }, [])

  /** 半路被打断（还没到位又翻转了）：动画取消、这一轮不记 */
  const abort = useCallback(() => {
    const run = runRef.current
    if (!run) return
    runRef.current = null
    phase.current = 'idle'
    cancelAnimationFrame(run.raf)
    clearTimeout(run.timeout)
    for (const a of run.animations) a.cancel()
  }, [])

  const startRun = useCallback(
    (isOpen: boolean, onTimeout: (run: Run) => void): Run => {
      const run: Run = {
        open: isOpen,
        startAt: performance.now(),
        frameTimes: [],
        counters: snapshotCounters(),
        raf: 0,
        timeout: setTimeout(() => {
          run.endedBy = 'timeout'
          onTimeout(run)
        }, SETTLE_FALLBACK_MS),
        animations: [],
        predictedLeft: null,
        endedBy: 'animationend'
      }
      const tick = (t: number) => {
        run.frameTimes.push(t)
        run.raf = requestAnimationFrame(tick)
      }
      run.raf = requestAnimationFrame(tick)
      runRef.current = run
      return run
    },
    []
  )

  /** 动画都跑完就收尾。中途被 abort 取消的话 finished 会 reject，这里吞掉 */
  const whenDone = (run: Run, then: () => void) => {
    void Promise.all(run.animations.map((a) => a.finished)).then(
      () => {
        if (runRef.current === run) then()
      },
      () => {}
    )
  }

  /*
    放 useLayoutEffect：翻转的同一帧里就把动画的起始帧摆好、把 settled 压成 false，
    否则会多画一帧错的出来（第七十八节栽过的那一下）。
  */
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!enabled) {
      abort()
      if (laidOut !== open) setLaidOut(open)
      setSettled(true)
      return
    }

    if (open && !laidOut && phase.current !== 'opening') {
      // 打开，第一步：不占位，盖着正文滑进来；正文滑向算出来的落点
      abort()
      phase.current = 'opening'
      setSettled(false)
      // 超时也得走「占位」这一步，否则中间层永远 0 宽、侧栏悬在正文上
      const run = startRun(true, () => setLaidOut(true))
      if (panelEl.current) run.animations.push(slide(panelEl.current, 0, -width))
      const found = findProse()
      if (found) {
        const { prose, container } = found
        const from = measuredLeft(prose, container)
        const to = proseLeftFor(container.clientWidth - width, proseMaxWidth(prose))
        run.predictedLeft = to
        run.animations.push(slide(prose, 0, to - from))
      }
      whenDone(run, () => setLaidOut(true))
      return
    }

    if (open && laidOut && phase.current === 'opening') {
      // 打开，第二步：占位了（这一帧重排），位移归零，落点验算在 finish 里
      finish(runRef.current?.endedBy ?? 'animationend')
      return
    }

    if (!open && laidOut) {
      // 收起，第一步：立刻不占位（这一帧重排）。下一趟 effect 再摆动画
      abort()
      phase.current = 'closingPending'
      setSettled(false)
      setLaidOut(false)
      return
    }

    if (!open && !laidOut && phase.current === 'closingPending') {
      // 收起，第二步：正文已经在新位置了，先拉回旧位置再滑过去；侧栏从原位滑出去
      phase.current = 'closing'
      const run = startRun(false, () => finish('timeout'))
      if (panelEl.current) run.animations.push(slide(panelEl.current, -width, 0))
      const found = findProse()
      if (found) {
        const { prose, container } = found
        const now = measuredLeft(prose, container)
        const maxW = proseMaxWidth(prose)
        const before = proseLeftFor(container.clientWidth - width, maxW)
        run.landingErrorPx = now - proseLeftFor(container.clientWidth, maxW)
        run.animations.push(slide(prose, before - now, 0))
      }
      whenDone(run, () => finish('animationend'))
      return
    }

    if (!open && phase.current === 'opening') {
      // 打开到一半就收：取消，内容本来就没占位，直接算收好
      abort()
      setSettled(true)
    }
  }, [open, laidOut, enabled, width, abort, finish, startRun])

  return { settled, laidOut, panelRef }
}
