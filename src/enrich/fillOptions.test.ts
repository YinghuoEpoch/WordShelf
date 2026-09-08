import { describe, it, expect } from 'vitest'
import { DEFAULT_FILL_OPTIONS, parseStoredFillOptions } from './fillOptions'

describe('记住上次填哪几类', () => {
  it('没存过时全开', () => {
    expect(parseStoredFillOptions(null)).toEqual(DEFAULT_FILL_OPTIONS)
    expect(parseStoredFillOptions('')).toEqual(DEFAULT_FILL_OPTIONS)
  })

  it('存了就读得回来', () => {
    expect(parseStoredFillOptions(JSON.stringify({ word: true, phrase: false, sentence: false }))).toEqual({
      word: true,
      phrase: false,
      sentence: false
    })
  })

  it('只存了一半时，没存的那几类算开', () => {
    expect(parseStoredFillOptions(JSON.stringify({ sentence: false }))).toEqual({
      word: true,
      phrase: true,
      sentence: false
    })
  })

  it('三个全关等于没得填，退回全开', () => {
    expect(parseStoredFillOptions(JSON.stringify({ word: false, phrase: false, sentence: false }))).toEqual(
      DEFAULT_FILL_OPTIONS
    )
  })

  it('存的根本不是 JSON 时也不炸', () => {
    expect(parseStoredFillOptions('{{{')).toEqual(DEFAULT_FILL_OPTIONS)
  })
})
