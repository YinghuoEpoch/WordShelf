import { describe, it, expect } from 'vitest'
import { getFolderReviewData, getPageReviewData } from './getFolderReviewData'
import type { Annotation, LyricPage } from '../types'

const page = (id: string, bookId: string | null, over: Partial<LyricPage> = {}): LyricPage => ({
  id,
  bookId,
  title: id,
  content: '',
  updatedAt: 0,
  ...over
})

const word = (id: string, docId: string, text: string, over: Partial<Annotation> = {}): Annotation => ({
  id,
  docId,
  type: 'word',
  start: 'L0W0',
  end: 'L0W0',
  text,
  order: 0,
  createdAt: 1,
  ...over
})

const PAGES = [
  page('p1', 'b1'),
  page('p2', 'b1', { title: '第二章' }),
  page('p3', 'b2'), // 别的文库
  page('p4', 'b1', { deletedAt: 1 }) // 回收站里的
]

describe('getFolderReviewData', () => {
  /** 摊平成 [词, 篇数] 好断言 */
  const flat = (groups: ReturnType<typeof getFolderReviewData>) =>
    groups.flatMap((g) => g.items.map((i) => [i.word, g.docCount] as const))

  it('同一个词在多篇文档里出现时合并成一条，并记下篇数和次数', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('a', 'p1', 'stood', { definition: '站立' }),
      word('b', 'p2', 'stood'),
      word('c', 'p1', 'walked')
    ])

    expect(flat(groups)).toEqual([
      ['stood', 2],
      ['walked', 1]
    ])
    expect(groups[0].items[0].frequency).toBe(2)
    expect(groups[0].items[0].ids).toEqual(['a', 'b'])
    // 合并时保留第一次出现的释义
    expect(groups[0].items[0].definition).toBe('站立')
  })

  it('大小写不同算同一个词', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('a', 'p1', 'Stood'),
      word('b', 'p2', 'stood')
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].docCount).toBe(2)
    expect(groups[0].items).toHaveLength(1)
  })

  it('只看这个文库，别的文库和回收站里的都不算', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('a', 'p1', 'kept'),
      word('b', 'p3', 'otherBook'),
      word('c', 'p4', 'inTrash')
    ])
    expect(flat(groups)).toEqual([['kept', 1]])
  })

  it('句摘不参与 —— 这是生词表', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('s', 'p1', '一整句话', { type: 'sentence', end: 'L0W5' }),
      word('a', 'p1', 'real')
    ])
    expect(flat(groups)).toEqual([['real', 1]])
  })

  it('按在几篇里划过分组，篇数多的组在前；同一篇里划两次不算两篇', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('a1', 'p1', 'twice'),
      word('a2', 'p2', 'twice'),
      word('b1', 'p1', 'thrice'),
      word('b2', 'p2', 'thrice'),
      word('b3', 'p1', 'thrice'),
      word('c', 'p1', 'zebra'),
      word('d', 'p1', 'apple'),
      word('e1', 'p1', 'samePage'),
      word('e2', 'p1', 'samePage')
    ])
    expect(groups.map((g) => g.docCount)).toEqual([2, 1])
    // 组内先按总次数从多到少，再按字母序：同一篇划过两次的 samePage 浮在 1 篇那组最前
    expect(groups[0].items.map((i) => i.word)).toEqual(['thrice', 'twice'])
    expect(groups[1].items.map((i) => i.word)).toEqual(['samePage', 'apple', 'zebra'])
  })

  it('三篇里都划过的排在两篇的前面', () => {
    const pages = [...PAGES, page('p5', 'b1')]
    const groups = getFolderReviewData('b1', pages, [
      word('a1', 'p1', 'two'),
      word('a2', 'p2', 'two'),
      word('b1', 'p1', 'three'),
      word('b2', 'p2', 'three'),
      word('b3', 'p5', 'three')
    ])
    expect(groups.map((g) => [g.docCount, g.items.map((i) => i.word)])).toEqual([
      [3, ['three']],
      [2, ['two']]
    ])
  })

  it('原文已删除 / AI 填充的标记会带到文库卡片上', () => {
    const groups = getFolderReviewData('b1', PAGES, [
      word('a', 'p1', 'gone', { start: null, end: null }),
      word('b', 'p1', 'guessed', { auto: true })
    ])
    const byWord = new Map(groups[0].items.map((i) => [i.word, i]))
    expect(byWord.get('gone')!.orphaned).toBe(true)
    expect(byWord.get('guessed')!.auto).toBe(true)
    expect(byWord.get('guessed')!.orphaned).toBeUndefined()
  })

  it('文档标题带在条目上，卡片要显示它来自哪一篇', () => {
    const groups = getFolderReviewData('b1', PAGES, [word('a', 'p2', 'x')])
    expect(groups[0].items[0].pageTitle).toBe('第二章')
    expect(groups[0].items[0].pageId).toBe('p2')
  })

  it('空文库返回空数组，不炸', () => {
    expect(getFolderReviewData('b1', PAGES, [])).toEqual([])
  })
})

describe('getPageReviewData', () => {
  const at = (line: number, w: number) => ({ start: `L${line}W${w}`, end: `L${line}W${w}` })

  it('同一篇里划了两次的词合并成一张卡，带着两条标注的 id', () => {
    const { high, normal } = getPageReviewData('p1', PAGES, [
      word('a', 'p1', 'stood', { ...at(0, 1), definition: '站立' }),
      word('b', 'p1', 'walked', at(1, 0)),
      word('c', 'p1', 'Stood', at(2, 3))
    ])
    expect(high.map((i) => [i.word, i.frequency, i.ids])).toEqual([['stood', 2, ['a', 'c']]])
    expect(high[0].definition).toBe('站立')
    expect(normal.map((i) => i.word)).toEqual(['walked'])
  })

  it('只看这一篇，别篇同一个词不算', () => {
    const { high, normal } = getPageReviewData('p1', PAGES, [
      word('a', 'p1', 'stood', at(0, 0)),
      word('b', 'p2', 'stood', at(0, 0))
    ])
    expect(high).toEqual([])
    expect(normal.map((i) => [i.word, i.frequency])).toEqual([['stood', 1]])
  })

  it('没重复的词按正文顺序、一个都不挪；高频按次数、次数相同按第一次出现', () => {
    const { high, normal } = getPageReviewData('p1', PAGES, [
      word('z1', 'p1', 'zebra', at(0, 0)),
      word('t1', 'p1', 'twice', at(0, 1)),
      word('a1', 'p1', 'apple', at(0, 2)),
      word('h1', 'p1', 'thrice', at(1, 0)),
      word('t2', 'p1', 'twice', at(1, 1)),
      word('h2', 'p1', 'thrice', at(2, 0)),
      word('h3', 'p1', 'thrice', at(3, 0)),
      word('l1', 'p1', 'later', at(4, 0)),
      word('l2', 'p1', 'later', at(5, 0))
    ])
    expect(normal.map((i) => i.word)).toEqual(['zebra', 'apple'])
    expect(high.map((i) => [i.word, i.frequency])).toEqual([
      ['thrice', 3],
      ['twice', 2],
      ['later', 2]
    ])
  })

  it('只出现一次的卡带「正文已改」的记号，合并卡不带', () => {
    const { high, normal } = getPageReviewData('p1', PAGES, [
      word('a', 'p1', 'once', { ...at(0, 0), type: 'phrase', sourceText: 'once upon' }),
      word('b', 'p1', 'dup', { ...at(1, 0), type: 'phrase', sourceText: 'dup a' }),
      word('c', 'p1', 'dup', { ...at(2, 0), type: 'phrase' })
    ])
    expect(normal[0].sourceText).toBe('once upon')
    expect(high[0].sourceText).toBeUndefined()
  })

  it('句摘不参与；空文档返回两个空组', () => {
    const { high, normal } = getPageReviewData('p1', PAGES, [
      word('s', 'p1', '一整句话', { type: 'sentence', end: 'L0W5' })
    ])
    expect(high).toEqual([])
    expect(normal).toEqual([])
  })
})
