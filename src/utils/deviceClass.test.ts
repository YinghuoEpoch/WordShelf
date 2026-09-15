import { describe, it, expect } from 'vitest'
import { isTabletClass } from './deviceClass'

describe('isTabletClass', () => {
  it('手机：短边不到 600 就不是平板，横竖屏一样', () => {
    expect(isTabletClass({ width: 412, height: 915 })).toBe(false)
    expect(isTabletClass({ width: 915, height: 412 })).toBe(false)
  })
  it('平板：短边 ≥ 600 就是平板，横竖屏一样', () => {
    expect(isTabletClass({ width: 800, height: 1280 })).toBe(true)
    expect(isTabletClass({ width: 1280, height: 800 })).toBe(true)
    expect(isTabletClass({ width: 600, height: 960 })).toBe(true)
  })
  it('拿不到 screen 时当手机', () => {
    expect(isTabletClass(undefined)).toBe(false)
  })
})
