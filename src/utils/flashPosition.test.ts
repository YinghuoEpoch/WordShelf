import { describe, it, expect } from 'vitest'
import {
  clampPosition,
  deckKey,
  loadFlashPosition,
  parseFlashPositions,
  saveFlashPosition,
  withPosition
} from './flashPosition'

/** 一个假的 localStorage，只要 getItem / setItem */
function fakeStore(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    }
  }
}

describe('deckKey', () => {
  it('范围和词/句一起进键，单篇和文库同一个 id 也分得开', () => {
    expect(deckKey({ type: 'page', id: 'x' }, 'vocab')).not.toBe(deckKey({ type: 'book', id: 'x' }, 'vocab'))
    expect(deckKey({ type: 'page', id: 'x' }, 'vocab')).not.toBe(deckKey({ type: 'page', id: 'x' }, 'sentence'))
  })
})

describe('parseFlashPositions', () => {
  it('没存过、坏掉的、不是表的都当空表', () => {
    expect(parseFlashPositions(null)).toEqual({})
    expect(parseFlashPositions('')).toEqual({})
    expect(parseFlashPositions('{oops')).toEqual({})
    expect(parseFlashPositions('[1,2]')).toEqual({})
    expect(parseFlashPositions('"str"')).toEqual({})
  })

  it('只收非负整数，别的丢掉', () => {
    expect(parseFlashPositions('{"a":3,"b":-1,"c":"x","d":1.5,"e":0}')).toEqual({ a: 3, e: 0 })
  })
})

describe('clampPosition', () => {
  it('没记过从头；记的超出今天这叠也从头', () => {
    expect(clampPosition(undefined, 10)).toBe(0)
    expect(clampPosition(4, 10)).toBe(4)
    expect(clampPosition(10, 10)).toBe(0)
    expect(clampPosition(4, 0)).toBe(0)
  })
})

describe('withPosition', () => {
  it('中途退出记下第几张；过完了或在第一张就删掉这一格', () => {
    let m = withPosition({}, 'k', 5, 10)
    expect(m).toEqual({ k: 5 })
    m = withPosition(m, 'k', 10, 10)
    expect(m).toEqual({})
    m = withPosition({ k: 3, other: 2 }, 'k', 0, 10)
    expect(m).toEqual({ other: 2 })
  })

  it('不动传进来的那张表', () => {
    const m = { k: 1 }
    withPosition(m, 'k', 5, 10)
    expect(m).toEqual({ k: 1 })
  })
})

describe('load / save', () => {
  it('存了再读回来，别的键不受影响', () => {
    const store = fakeStore()
    saveFlashPosition('a', 7, 20, store)
    saveFlashPosition('b', 2, 20, store)
    expect(loadFlashPosition('a', 20, store)).toBe(7)
    expect(loadFlashPosition('b', 20, store)).toBe(2)
    // 卡变少了，超出去的从头来
    expect(loadFlashPosition('a', 5, store)).toBe(0)
  })

  it('没有 storage 时读到 0、存不炸', () => {
    expect(loadFlashPosition('a', 20, null)).toBe(0)
    expect(() => saveFlashPosition('a', 1, 20, null)).not.toThrow()
  })

  it('storage 抛错时读到 0、存不炸', () => {
    const bad = {
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => {
        throw new Error('quota')
      }
    }
    expect(loadFlashPosition('a', 20, bad)).toBe(0)
    expect(() => saveFlashPosition('a', 1, 20, bad)).not.toThrow()
  })
})
