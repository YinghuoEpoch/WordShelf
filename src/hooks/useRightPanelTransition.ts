import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { TransitionEvent } from 'react'
import { recordPanelTransition, snapshotCounters, summarizeFrames } from '../panelTransition'

/**
 * 等不到 transitionend 时，最多等这么久就当结束。
 *
 * 过渡本身 200ms；事件不来的情形有两种：宽度根本没变（没有过渡可言），
 * 或者主线程被卡到事件迟迟不派发。前者立刻超时也无妨，后者本来就是要量的东西。
 */
export const SETTLE_FALLBACK_MS = 1000

export interface RightPanelTransition {
  /**
   * 侧栏此刻是不是**滑到位了**。翻转 `open` 的那一刻变 false，
   * 等到它的宽度过渡真正结束（或兜底超时）才回到 true。
   *
   * 「笔记」键只在 settled 之后才露出来 —— 缘由见 App.tsx 那颗键上的注释。
   */
  settled: boolean
  /** 挂在**做宽度过渡的那一层**上。只认它自己的 width，孩子们的过渡一律不理 */
  onTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void
}

interface Run {
  open: boolean
  startAt: number
  frameTimes: number[]
  counters: { systemBars: number; anchorCalcs: number }
  raf: number
  timeout: ReturnType<typeof setTimeout>
}

/**
 * 盯着右侧栏（宽屏）那 200ms 的宽度过渡：**什么时候真正结束**，以及**期间发生了什么**。
 *
 * ## 为什么要「真正结束」而不是等 200ms
 *
 * 从前「笔记」键靠 `delay-200` 等侧栏滑完再淡入。定时器走的是墙钟，
 * 侧栏过渡也按墙钟算，本该同时到 —— 但长文档里开合会掉帧（第七十七节），
 * 画到屏幕上的那几帧落后了，用户看到的就是**侧栏还没收完、键先出来了**。
 * 两个各自计时的东西，一卡就对不上。还有一处更直接的：收右栏时两栏都收起
 * 就进沉浸，那颗键走的是「跟着顶栏出没、不等」那条分支，等都没等。
 *
 * 改成听 transitionend：侧栏什么时候到位，键什么时候出来，卡不卡都对。
 *
 * ## 顺便把那 200ms 量下来
 *
 * 帧数、最长一帧、期间系统栏调了几次、「最后一个词」算了几次 ——
 * 三个候选成因各对一个数，进设置 → 开发者 → 侧栏过渡参数 看。
 * 存数和算数在 panelTransition.ts，这里只做量的动作。
 *
 * ⚠️ 这个环境里验不了：面板隐藏时过渡不推进、rAF 不触发（见交接文档那张表）。
 * 数是真机上的，这里只保证逻辑不出错。
 */
export function useRightPanelTransition(open: boolean, enabled: boolean): RightPanelTransition {
  const [settled, setSettled] = useState(true)
  const runRef = useRef<Run | null>(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const mounted = useRef(false)

  const finish = useCallback((endedBy: 'transitionend' | 'timeout') => {
    const run = runRef.current
    if (!run) return
    runRef.current = null
    cancelAnimationFrame(run.raf)
    clearTimeout(run.timeout)
    const now = performance.now()
    const after = snapshotCounters()
    recordPanelTransition({
      open: run.open,
      durationMs: now - run.startAt,
      ...summarizeFrames(run.startAt, run.frameTimes),
      systemBarCalls: after.systemBars - run.counters.systemBars,
      anchorCalcs: after.anchorCalcs - run.counters.anchorCalcs,
      endedBy,
      at: Date.now()
    })
    setSettled(true)
  }, [])

  /*
    放 useLayoutEffect：翻转的同一帧里就把 settled 压成 false，
    否则会多画一帧「键已经露出来」的（第七十八节栽过的那一下）。
  */
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!enabledRef.current) return
    setSettled(false)
    const run: Run = {
      open,
      startAt: performance.now(),
      frameTimes: [],
      counters: snapshotCounters(),
      raf: 0,
      timeout: setTimeout(() => finish('timeout'), SETTLE_FALLBACK_MS)
    }
    const tick = (t: number) => {
      run.frameTimes.push(t)
      run.raf = requestAnimationFrame(tick)
    }
    run.raf = requestAnimationFrame(tick)
    runRef.current = run
    return () => {
      // 还没结束又翻转了：这一轮不记，让下一轮从头量
      if (runRef.current === run) {
        runRef.current = null
        cancelAnimationFrame(run.raf)
        clearTimeout(run.timeout)
      }
    }
  }, [open, finish])

  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || e.propertyName !== 'width') return
      finish('transitionend')
    },
    [finish]
  )

  return { settled, onTransitionEnd }
}
