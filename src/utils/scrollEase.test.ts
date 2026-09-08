import { describe, it, expect } from 'vitest'
import { centerTarget, approach, FOLLOW_TAU_MS } from './scrollEase'

describe('centerTarget', () => {
  it('把卡摆到正中：卡的中点对准容器的中点', () => {
    // 容器 600 高，卡 100 高、上沿在 1000 → 卡中点 1050 要对准视口中点 → 滚到 750
    expect(centerTarget(1000, 100, 600, 3000)).toBe(750)
  })

  it('列表顶到头了就停在 0，不出负数', () => {
    expect(centerTarget(50, 100, 600, 3000)).toBe(0)
  })

  it('列表到底了就停在能滚到的最大值', () => {
    // 最大 3000 - 600 = 2400
    expect(centerTarget(2900, 100, 600, 3000)).toBe(2400)
  })

  it('内容不够一屏时一律 0', () => {
    expect(centerTarget(200, 100, 600, 400)).toBe(0)
  })
})

describe('approach', () => {
  it('过一个 τ 走完约 63%', () => {
    const next = approach(0, 100, FOLLOW_TAU_MS)
    expect(next).toBeCloseTo(63.2, 0)
  })

  it('帧越长走得越多，掉帧不会拖慢', () => {
    expect(approach(0, 100, 32)).toBeGreaterThan(approach(0, 100, 16))
  })

  it('往回走也一样', () => {
    const next = approach(100, 0, FOLLOW_TAU_MS)
    expect(next).toBeCloseTo(36.8, 0)
  })

  it('永远不会冲过头', () => {
    let cur = 0
    for (let i = 0; i < 200; i++) {
      cur = approach(cur, 100, 16)
      expect(cur).toBeLessThanOrEqual(100)
    }
  })

  it('够近了就正好落在目标上，而且会在有限帧内到达', () => {
    let cur = 0
    let frames = 0
    while (cur !== 100 && frames < 1000) {
      cur = approach(cur, 100, 16)
      frames++
    }
    expect(cur).toBe(100)
    // 160ms 的 τ、16ms 一帧：到半像素以内大约 5τ ≈ 55 帧
    expect(frames).toBeLessThan(80)
  })

  it('已经在目标上就不动', () => {
    expect(approach(455.3, 455.3, 16)).toBe(455.3)
  })

  it('⚠️ 中途换目标不重启：只是从当前位置奔向新目标', () => {
    let cur = 0
    for (let i = 0; i < 5; i++) cur = approach(cur, 100, 16)
    const before = cur
    // 换成往回走：下一帧从 before 出发，不会跳回 0 或跳到 100
    const next = approach(cur, 20, 16)
    expect(next).toBeLessThan(before)
    expect(next).toBeGreaterThan(20)
  })
})
