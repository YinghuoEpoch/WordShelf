import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StepCursor, stepDelay, STEP_NEAR_MS, STEP_FAR_MS } from './stepCursor'

describe('stepDelay', () => {
  it('差 1 格最慢，差得越远越快，到 4 格封顶', () => {
    expect(stepDelay(1)).toBe(STEP_NEAR_MS)
    expect(stepDelay(2)).toBe(STEP_NEAR_MS / 2)
    expect(stepDelay(3)).toBe(STEP_NEAR_MS / 3)
    expect(stepDelay(4)).toBe(STEP_FAR_MS)
    expect(stepDelay(50)).toBe(STEP_FAR_MS)
  })

  it('方向不影响快慢', () => {
    expect(stepDelay(-3)).toBe(stepDelay(3))
  })
})

describe('StepCursor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const make = (initial = 0) => {
    const seen: number[] = []
    const c = new StepCursor((i) => seen.push(i), initial, () => Date.now())
    return { c, seen }
  }

  it('⚠️ 目标一次跨好几格，也是一格一格过去的，中间每一条都亮过', () => {
    const { c, seen } = make(5)
    c.setTarget(9)
    vi.advanceTimersByTime(2000)
    expect(seen).toEqual([6, 7, 8, 9])
    expect(c.current).toBe(9)
  })

  it('差得远走得快、差得近走得慢：4 → 3 → 2 → 1 格的间隔依次是 60、80、120、240', () => {
    const { c, seen } = make(0)
    c.setTarget(4)
    vi.advanceTimersByTime(59)
    expect(seen).toEqual([])
    vi.advanceTimersByTime(1) // 60
    expect(seen).toEqual([1])
    vi.advanceTimersByTime(80) // 140
    expect(seen).toEqual([1, 2])
    vi.advanceTimersByTime(120) // 260
    expect(seen).toEqual([1, 2, 3])
    vi.advanceTimersByTime(239)
    expect(seen).toEqual([1, 2, 3])
    vi.advanceTimersByTime(1) // 500
    expect(seen).toEqual([1, 2, 3, 4])
  })

  it('往回走也一样', () => {
    const { c, seen } = make(5)
    c.setTarget(3)
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual([4, 3])
  })

  it('⚠️ 目标换了不重头等：已经等了一半，按新距离只会提前、不会推迟', () => {
    const { c, seen } = make(0)
    c.setTarget(1) // 差 1 格：240ms 后落下
    vi.advanceTimersByTime(200)
    // 正文又滚了：现在差 4 格，这一步该在 60ms 处就落下 —— 早过了，立刻
    c.setTarget(4)
    vi.advanceTimersByTime(0)
    expect(seen).toEqual([1])
    // 反过来：差 4 格等了 30ms，目标缩回差 1 格 —— 维持原定的 60ms，不改成 240
    const b = make(0)
    b.c.setTarget(4)
    vi.advanceTimersByTime(30)
    b.c.setTarget(1)
    vi.advanceTimersByTime(30)
    expect(b.seen).toEqual([1])
  })

  it('正文一直在滚时，竖线始终在追，不被每次上报打断', () => {
    const { c, seen } = make(0)
    // 每 120ms 报一次，目标每次加 2
    for (let t = 1; t <= 10; t++) {
      c.setTarget(t * 2)
      vi.advanceTimersByTime(120)
    }
    // 1200ms 里一格格走过去了，而不是干等
    expect(seen.length).toBeGreaterThan(8)
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBe(1)
    vi.advanceTimersByTime(3000)
    expect(c.current).toBe(20)
  })

  it('jump 直接到位，取消在等的那一步；已经在那儿就不通知', () => {
    const { c, seen } = make(0)
    c.setTarget(5)
    vi.advanceTimersByTime(60)
    expect(seen).toEqual([1])
    c.jump(9)
    expect(seen).toEqual([1, 9])
    vi.advanceTimersByTime(2000)
    expect(seen).toEqual([1, 9])
    c.jump(9)
    expect(seen).toEqual([1, 9])
  })

  it('cancel 之后留在原地', () => {
    const { c, seen } = make(0)
    c.setTarget(5)
    vi.advanceTimersByTime(60)
    c.cancel()
    vi.advanceTimersByTime(2000)
    expect(seen).toEqual([1])
    expect(c.current).toBe(1)
  })

  it('还没有过位置（-1）时第一次 setTarget 直接落上去', () => {
    const { c, seen } = make(-1)
    c.setTarget(7)
    expect(seen).toEqual([7])
  })
})
