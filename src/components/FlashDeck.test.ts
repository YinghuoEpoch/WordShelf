import { describe, it, expect } from 'vitest'
import { dragOffset, swipeDirection, scrubIndex, thumbPercent, SWIPE_PX } from './FlashDeck'

describe('dragOffset', () => {
  it('触发线之内一比一跟手，过了之后只按三分之一算', () => {
    expect(dragOffset(-30)).toBe(-30)
    expect(dragOffset(30)).toBe(30)
    expect(dragOffset(-(SWIPE_PX + 30))).toBe(-(SWIPE_PX + 10))
    expect(dragOffset(SWIPE_PX + 30)).toBe(SWIPE_PX + 10)
  })
})

describe('swipeDirection', () => {
  it('往左够远是下一张，往右够远是上一张，不够弹回', () => {
    expect(swipeDirection(-SWIPE_PX)).toBe(1)
    expect(swipeDirection(SWIPE_PX)).toBe(-1)
    expect(swipeDirection(-(SWIPE_PX - 1))).toBe(0)
    expect(swipeDirection(0)).toBe(0)
  })
})

describe('scrubIndex', () => {
  it('轨道两端是第一张和最后一张，中间按比例四舍五入', () => {
    expect(scrubIndex(0, 0, 100, 11)).toBe(0)
    expect(scrubIndex(100, 0, 100, 11)).toBe(10)
    expect(scrubIndex(50, 0, 100, 11)).toBe(5)
    expect(scrubIndex(35, 0, 100, 11)).toBe(4) // 3.5 → 4
  })

  it('手指出了轨道两头钉在两端', () => {
    expect(scrubIndex(-40, 0, 100, 11)).toBe(0)
    expect(scrubIndex(999, 0, 100, 11)).toBe(10)
  })

  it('只有一张、或轨道没宽度时一律第一张', () => {
    expect(scrubIndex(50, 0, 100, 1)).toBe(0)
    expect(scrubIndex(50, 0, 0, 11)).toBe(0)
  })

  it('轨道不从 0 开始时按轨道自己的左边算', () => {
    expect(scrubIndex(250, 200, 100, 11)).toBe(5)
  })
})

describe('thumbPercent', () => {
  it('第一张 0、最后一张 100、过完了那一屏也停在 100', () => {
    expect(thumbPercent(0, 5)).toBe(0)
    expect(thumbPercent(4, 5)).toBe(100)
    expect(thumbPercent(5, 5)).toBe(100)
    expect(thumbPercent(2, 5)).toBe(50)
  })

  it('只有一张时停在最左，过完了停最右', () => {
    expect(thumbPercent(0, 1)).toBe(0)
    expect(thumbPercent(1, 1)).toBe(100)
  })
})
