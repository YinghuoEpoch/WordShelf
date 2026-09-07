import { describe, it, expect, beforeEach } from 'vitest'
import {
  FRAME_BUDGET_MS,
  MAX_RECORDS,
  countAnchorCalc,
  countSystemBarCall,
  expectedFrames,
  getPanelTransitions,
  judgeSmoothness,
  recordPanelTransition,
  resetPanelTransitions,
  snapshotCounters,
  summarizeFrames,
  type PanelTransitionRecord
} from './panelTransition'

/**
 * 侧栏过渡读数的算数部分。量的动作（rAF、transitionend）在真机上才有意义，
 * 这里钉的是「量到的数怎么算成结论」—— 算错了，读数屏就会把卡的说成顺的。
 */

const 一条 = (over: Partial<PanelTransitionRecord> = {}): PanelTransitionRecord => ({
  open: false,
  durationMs: 200,
  frames: 12,
  longestFrameMs: 17,
  systemBarCalls: 0,
  anchorCalcs: 0,
  endedBy: 'transitionend',
  at: 0,
  ...over
})

beforeEach(() => resetPanelTransitions())

describe('expectedFrames', () => {
  it('200ms 按 60Hz 应有 12 帧', () => {
    expect(expectedFrames(200)).toBe(12)
  })
  it('再短也至少算 1 帧，免得除出 0', () => {
    expect(expectedFrames(3)).toBe(1)
  })
})

describe('summarizeFrames', () => {
  it('帧数就是时间戳的个数，最长间隔含「翻转到第一帧」那一段', () => {
    // 翻转在 0，第一帧迟到 90ms —— 这一段就是卡
    expect(summarizeFrames(0, [90, 106, 122])).toEqual({ frames: 3, longestFrameMs: 90 })
  })
  it('一帧都没画到就是 0 帧、0 间隔', () => {
    expect(summarizeFrames(0, [])).toEqual({ frames: 0, longestFrameMs: 0 })
  })
})

describe('judgeSmoothness', () => {
  it('12 帧、每帧一个预算 —— 顺', () => {
    expect(judgeSmoothness({ durationMs: 200, frames: 12, longestFrameMs: FRAME_BUDGET_MS })).toBe('顺')
  })
  it('第七十七节量到的 84.5ms 那一帧 —— 卡', () => {
    expect(judgeSmoothness({ durationMs: 200, frames: 8, longestFrameMs: 84.5 })).toBe('卡')
  })
  it('掉一半帧，哪怕单帧不算长 —— 也是卡', () => {
    expect(judgeSmoothness({ durationMs: 200, frames: 5, longestFrameMs: 40 })).toBe('卡')
  })
  it('掉两三帧 —— 略卡', () => {
    expect(judgeSmoothness({ durationMs: 200, frames: 10, longestFrameMs: 30 })).toBe('略卡')
  })
})

describe('记录', () => {
  it('最新的在前，只留最近 MAX_RECORDS 条', () => {
    for (let i = 0; i < MAX_RECORDS + 3; i++) recordPanelTransition(一条({ at: i }))
    const all = getPanelTransitions()
    expect(all).toHaveLength(MAX_RECORDS)
    expect(all[0].at).toBe(MAX_RECORDS + 2)
    expect(all[all.length - 1].at).toBe(3)
  })
})

describe('计数器', () => {
  it('前后两张快照的差值就是期间发生的次数', () => {
    const before = snapshotCounters()
    countSystemBarCall()
    countAnchorCalc()
    countAnchorCalc()
    const after = snapshotCounters()
    expect(after.systemBars - before.systemBars).toBe(1)
    expect(after.anchorCalcs - before.anchorCalcs).toBe(2)
  })
  it('快照是拷贝，之后再计数不会改到已拍的那张', () => {
    const before = snapshotCounters()
    countSystemBarCall()
    expect(before.systemBars).toBe(0)
  })
})
