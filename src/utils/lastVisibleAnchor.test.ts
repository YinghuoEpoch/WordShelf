import { describe, it, expect } from 'vitest'
import { pickLastVisibleAnchor } from './lastVisibleAnchor'

/**
 * 一段就是「上沿在屏幕外没有」+「露着的最后一个词」两个答案，像素在这里不重要。
 * `words: null` 表示这一段里一个词都没露（空行、只有标点、或者第一个词还没进屏幕）。
 */
interface P {
  below: boolean
  words: string | null
}

const pick = (ps: P[]) =>
  pickLastVisibleAnchor(
    ps,
    (p) => p.below,
    (p) => p.words
  )

describe('pickLastVisibleAnchor', () => {
  it('最后一个露着的段落里有词，就取它', () => {
    expect(
      pick([
        { below: false, words: 'L0W9' },
        { below: false, words: 'L2W4' },
        { below: true, words: 'L4W0' }
      ])
    ).toBe('L2W4')
  })

  it('掉到屏幕外的段落和它后面的都不算，哪怕后面的说自己有词', () => {
    expect(
      pick([
        { below: false, words: 'L0W9' },
        { below: true, words: 'L2W4' },
        { below: false, words: 'L4W0' }
      ])
    ).toBe('L0W9')
  })

  it('⚠️ 段落刚露头、第一个词还没进来，且上一段是空行：要退到再上一段的词', () => {
    // 这就是「右侧栏时不时窜到顶部一下再回来」的根子：
    // epub 的书段落之间隔一个空行，只退一段退到空行上，就报了 null
    expect(
      pick([
        { below: false, words: 'L18W69' },
        { below: false, words: null }, // 空行
        { below: false, words: null }, // 上沿露出 2px，第一个词的行内框还在屏幕外
        { below: true, words: 'L22W0' }
      ])
    ).toBe('L18W69')
  })

  it('连着好几段都没词（章节分隔符、空行、数字），一路退到有词为止', () => {
    expect(
      pick([
        { below: false, words: 'L3W12' },
        { below: false, words: null }, // 空行
        { below: false, words: null }, // * * *
        { below: false, words: null }, // 空行
        { below: false, words: null }, // 1876
        { below: true, words: 'L9W0' }
      ])
    ).toBe('L3W12')
  })

  it('一个词都没露过（还在最顶上）才报 null', () => {
    expect(pick([{ below: false, words: null }, { below: true, words: 'L2W0' }])).toBeNull()
    expect(pick([])).toBeNull()
  })
})
