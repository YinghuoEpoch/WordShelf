import { describe, it, expect } from 'vitest'
import { tokenizeLine } from './tokenize'
import { splitEdgePunctuation } from './punctuation'
import { buildCoverMap, clusterMask } from './rangeClusters'

const segs = (line: string) => splitEdgePunctuation(tokenizeLine(line))
const anchor = (w: number) => `L0W${w}`
const words = (line: string) =>
  segs(line)
    .filter((s) => s.type === 'en')
    .map((_, i) => ({ anchorId: anchor(i) }))
const range = (from: number, to: number) => ({ startAnchorId: anchor(from), endAnchorId: anchor(to) })

/** 把簇号按段落原文拼出来看：`[1:He smiled.] [2:She left.]` 这种（簇外的字照抄） */
function render(line: string, mask: ReturnType<typeof clusterMask>): string {
  const s = segs(line)
  let out = ''
  let cur = 0
  s.forEach((seg, i) => {
    const id = mask.cluster[i]
    if (id !== cur) {
      if (cur) out += ']'
      if (id) out += `[${id}:`
      cur = id
    }
    out += seg.text
  })
  if (cur) out += ']'
  return out
}

describe('相邻的两条范围要分成两簇', () => {
  it('前后两句各划一条：两簇，中间的空格谁也不盖', () => {
    const line = 'He smiled. She left.'
    const cover = buildCoverMap([range(0, 1), range(2, 3)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('[1:He smiled.] [2:She left.]')
  })

  it('两个挨着的短语：同样分开，短语不带标点', () => {
    const line = 'all right sticking out, sir'
    const cover = buildCoverMap([range(0, 1), range(2, 3)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, false)
    expect(render(line, mask)).toBe('[1:all right] [2:sticking out], sir')
  })

  it('两句之间隔着没划的词：两簇，中间的词照旧', () => {
    const line = 'He smiled and she left'
    const cover = buildCoverMap([range(0, 1), range(3, 4)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('[1:He smiled] and [2:she left]')
  })

  it('引号归各自那一句：前一句吃收尾的引号，后一句吃开头的引号', () => {
    const line = '“Go,” he said. “Now.”'
    const cover = buildCoverMap([range(0, 2), range(3, 3)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('[1:“Go,” he said.] [2:“Now.”]')
  })
})

describe('重叠、嵌套、单独一条，照旧一簇', () => {
  it('同一条范围划了两次或两条范围有共享的词：一簇', () => {
    const line = 'one two three four'
    const cover = buildCoverMap([range(0, 2), range(2, 3)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('[1:one two three four]')
  })

  it('一条范围套在另一条里面：一簇', () => {
    const line = 'one two three four'
    const cover = buildCoverMap([range(0, 3), range(1, 2)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('[1:one two three four]')
  })

  it('只有一条：照旧', () => {
    const line = 'He smiled. She left.'
    const cover = buildCoverMap([range(2, 3)], words(line))
    const mask = clusterMask(segs(line), anchor, cover, true)
    expect(render(line, mask)).toBe('He smiled. [1:She left.]')
  })

  it('没有范围：全 0', () => {
    const line = 'He smiled.'
    const mask = clusterMask(segs(line), anchor, buildCoverMap([], words(line)), true)
    expect(mask.cluster.every((c) => c === 0)).toBe(true)
  })

  it('孤儿范围和定位不到的范围不盖', () => {
    const line = 'He smiled. She left.'
    const cover = buildCoverMap(
      [{ ...range(0, 1), orphaned: true }, { startAnchorId: 'L9W9', endAnchorId: 'L9W9' }],
      words(line)
    )
    expect(cover.size).toBe(0)
  })
})
