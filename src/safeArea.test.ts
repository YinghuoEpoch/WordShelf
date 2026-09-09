import { describe, it, expect } from 'vitest'
import { realBottomAfter, realTopAfter } from './safeArea'

/**
 * 「状态栏本来多高」的更新规则。
 *
 * 第八十一节读数屏量到的：用户的手机藏起状态栏后原生报的 top 是 29（刘海），不是 0，
 * 从前只拦「报 0」，29 混进去之后顶栏一会儿按 38 留、一会儿按 29 留，
 * 正文在每次翻转之后 150ms 又挪 9px。规则改成「藏着的期间一律不采信」。
 */
describe('realTopAfter', () => {
  it('系统栏放着、报了正数：跟上（转屏、换机器）', () => {
    expect(realTopAfter(38, 44, false)).toBe(44)
  })
  it('系统栏放着、报 0：不采信（还没拿到真值）', () => {
    expect(realTopAfter(38, 0, false)).toBe(38)
  })
  it('系统栏藏着、报 0（平板）：不采信', () => {
    expect(realTopAfter(38, 0, true)).toBe(38)
  })
  it('系统栏藏着、报刘海的 29（手机）：也不采信 —— 这是这次修的那一条', () => {
    expect(realTopAfter(38, 29, true)).toBe(38)
  })
  it('放出来之后原生把 38 报回来：跟上（和藏之前一样，顶栏厚度不变）', () => {
    expect(realTopAfter(38, 38, false)).toBe(38)
  })
})

describe('realBottomAfter（导航栏本来多高，抽卡底下按它让）', () => {
  it('系统栏放着：报什么跟什么，报 0 也跟 —— 手势导航底下本来就是 0', () => {
    expect(realBottomAfter(48, 48, false)).toBe(48)
    expect(realBottomAfter(48, 0, false)).toBe(0)
    expect(realBottomAfter(0, 48, false)).toBe(48)
  })
  it('系统栏藏着：报 0 不采信，导航栏本来的 48 留着 —— 平板上抽卡沉 24px 就是这一条修的', () => {
    expect(realBottomAfter(48, 0, true)).toBe(48)
  })
})
