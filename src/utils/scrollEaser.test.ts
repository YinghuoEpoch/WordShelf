import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ScrollEaser } from './scrollEase'

/**
 * 假的 rAF：把回调攒起来，`frame(ms)` 手动推进一帧。
 * 真 rAF 在这个测试环境里不存在，而且就算有也没法按帧控制。
 */
let queue: Array<(now: number) => void> = []
let now = 0
const frame = (ms = 16) => {
  now += ms
  const cbs = queue
  queue = []
  cbs.forEach((cb) => cb(now))
}

beforeEach(() => {
  queue = []
  now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    queue.push(cb)
    return queue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    queue = []
  })
  vi.stubGlobal('performance', { now: () => now })
})
afterEach(() => vi.unstubAllGlobals())

const box = (scrollTop = 0) => ({ scrollTop }) as unknown as HTMLElement

describe('ScrollEaser', () => {
  it('一帧帧逼近，最后正好落在目标上，然后停', () => {
    const el = box(0)
    const e = new ScrollEaser()
    e.to(el, 100)
    expect(e.running).toBe(true)
    const seen: number[] = []
    for (let i = 0; i < 200 && e.running; i++) {
      frame()
      seen.push(el.scrollTop)
    }
    expect(el.scrollTop).toBe(100)
    expect(e.running).toBe(false)
    // 单调递增、不冲过头
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
      expect(seen[i]).toBeLessThanOrEqual(100)
    }
    expect(seen.length).toBeGreaterThan(5)
  })

  it('⚠️ 中途换目标不重启：从当前位置奔向新目标，循环只有一条', () => {
    const el = box(0)
    const e = new ScrollEaser()
    e.to(el, 100)
    for (let i = 0; i < 6; i++) frame()
    const mid = el.scrollTop
    // 6 帧 ≈ 96ms，走了四成多，已经越过 20
    expect(mid).toBeGreaterThan(20)
    e.to(el, 20)
    // 还是同一条循环：队列里只有一个回调
    expect(queue.length).toBe(1)
    frame()
    expect(el.scrollTop).toBeLessThan(mid)
    expect(el.scrollTop).toBeGreaterThan(20)
    for (let i = 0; i < 200 && e.running; i++) frame()
    expect(el.scrollTop).toBe(20)
  })

  it('cancel 之后留在原地，不再动', () => {
    const el = box(0)
    const e = new ScrollEaser()
    e.to(el, 100)
    frame()
    frame()
    const at = el.scrollTop
    e.cancel()
    expect(e.running).toBe(false)
    frame()
    frame()
    expect(el.scrollTop).toBe(at)
  })

  it('已经在目标上时一帧就收工', () => {
    const el = box(455)
    const e = new ScrollEaser()
    e.to(el, 455)
    frame()
    expect(e.running).toBe(false)
    expect(el.scrollTop).toBe(455)
  })
})
