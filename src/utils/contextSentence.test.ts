import { describe, it, expect } from 'vitest'
import { contextSentence, sentenceBounds, clipBefore, clipAfter, MAX_SIDE } from './contextSentence'
import { buildWordList } from './reconcile'

/** 找到 word 在 line 里的位置，省得手数偏移 */
const at = (line: string, word: string): [number, number] => {
  const i = line.indexOf(word)
  if (i === -1) throw new Error(`${word} not in line`)
  return [i, i + word.length]
}

describe('sentenceBounds', () => {
  it('前后各到句号为止，句子里的词整句带出来', () => {
    const line = 'He stood up. The iron fetters fell away. Nobody moved.'
    const [s, e] = sentenceBounds(line, ...at(line, 'fetters'))
    expect(line.slice(s, e)).toBe('The iron fetters fell away.')
  })

  it('问号、叹号、中文句号都算句末', () => {
    const line = 'Really? Yes! 他说。Then silence fell. Done'
    const [s, e] = sentenceBounds(line, ...at(line, 'silence'))
    expect(line.slice(s, e)).toBe('Then silence fell.')
  })

  it('句末的引号跟着这一句走，下一句的开头引号归下一句', () => {
    const line = '“Come in.” “I like it,” she said. Fine.'
    const [s, e] = sentenceBounds(line, ...at(line, 'like'))
    expect(line.slice(s, e)).toBe('“I like it,” she said.')
  })

  it('小数点、缩略语、单个字母的缩写后面的点不算句末', () => {
    const line = 'Mr. Darcy paid 3.14 dollars to J. K. Rowling for it. Next.'
    const [s, e] = sentenceBounds(line, ...at(line, 'dollars'))
    expect(line.slice(s, e)).toBe('Mr. Darcy paid 3.14 dollars to J. K. Rowling for it.')
  })

  it('省略号整个算在这一句里', () => {
    const line = 'I was waiting... and waiting. Then it came.'
    const [s, e] = sentenceBounds(line, ...at(line, 'came'))
    expect(line.slice(s, e)).toBe('Then it came.')
    const [s2, e2] = sentenceBounds(line, ...at(line, 'waiting'))
    expect(line.slice(s2, e2)).toBe('I was waiting...')
  })

  it('没有句末标点就整行都是这一句', () => {
    const line = 'just a title line'
    expect(sentenceBounds(line, ...at(line, 'title'))).toEqual([0, line.length])
  })

  it('标注自己以句号结尾（句摘那样）时，句子到它为止', () => {
    const line = 'One. Two words here. Three.'
    const [s, e] = sentenceBounds(line, ...at(line, 'Two words here.'))
    expect(line.slice(s, e)).toBe('Two words here.')
  })
})

describe('clipBefore / clipAfter', () => {
  it('不超长原样返回', () => {
    expect(clipBefore('short')).toBe('short')
    expect(clipAfter('short')).toBe('short')
  })

  it('超长时在词边界截断并加省略号', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    const b = clipBefore(long, 30)
    expect(b.startsWith('…')).toBe(true)
    expect(b.length).toBeLessThanOrEqual(31)
    expect(b.slice(1).startsWith('w')).toBe(true) // 没从词中间切
    const a = clipAfter(long, 30)
    expect(a.endsWith('…')).toBe(true)
    expect(a.length).toBeLessThanOrEqual(31)
    expect(/w\d+…$/.test(a)).toBe(true)
  })

  it('默认上限是 MAX_SIDE', () => {
    expect(clipAfter('x'.repeat(MAX_SIDE))).toBe('x'.repeat(MAX_SIDE))
    expect(clipAfter('x'.repeat(MAX_SIDE + 1)).endsWith('…')).toBe(true)
  })
})

describe('contextSentence', () => {
  const content = 'Line zero here.\nHe stood up. The iron fetters fell away. Nobody moved.\nLast line'
  const words = buildWordList(content)

  it('单词：整句带出来，词单独拎出', () => {
    // 第 1 行：He(0) stood(1) up(2) The(3) iron(4) fetters(5)
    expect(contextSentence(content, words, 'L1W5', 'L1W5')).toEqual({
      before: 'The iron ',
      hit: 'fetters',
      after: ' fell away.'
    })
  })

  it('短语：范围整段高亮', () => {
    expect(contextSentence(content, words, 'L1W4', 'L1W6')).toEqual({
      before: 'The ',
      hit: 'iron fetters fell',
      after: ' away.'
    })
  })

  it('缩写后缀跟着词一起高亮', () => {
    const c = "I don't know. Fine."
    const w = buildWordList(c)
    // I(0) do(1) know(2)
    expect(contextSentence(c, w, 'L0W1', 'L0W1')).toEqual({
      before: 'I ',
      hit: "don't",
      after: ' know.'
    })
  })

  it('孤儿、找不到的坐标、越界的行都返回 null', () => {
    expect(contextSentence(content, words, null, null)).toBeNull()
    expect(contextSentence(content, words, 'L1W99', 'L1W99')).toBeNull()
    expect(contextSentence(content, words, 'orphan:x', 'orphan:x')).toBeNull()
  })

  it('范围跨行：只取起点那一行，高亮到这一句末尾', () => {
    // Nobody(8) moved(9) 在第 1 行；Last(0) 在第 2 行
    expect(contextSentence(content, words, 'L1W8', 'L2W0')).toEqual({
      before: '',
      hit: 'Nobody moved.',
      after: ''
    })
  })

  it('起止写反了也能切', () => {
    expect(contextSentence(content, words, 'L1W6', 'L1W4')!.hit).toBe('iron fetters fell')
  })

  it('行尾的 CR 不带进句子', () => {
    const c = 'One two.\r\nThree four.\r\n'
    const w = buildWordList(c)
    expect(contextSentence(c, w, 'L1W1', 'L1W1')).toEqual({ before: 'Three ', hit: 'four', after: '.' })
  })
})
