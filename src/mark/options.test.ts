import { describe, it, expect } from 'vitest'
import { DEFAULT_MARK_OPTIONS, parseStoredMarkOptions } from './options'

/** 认不出的一律退回默认档 —— 存的东西坏了不该让这个功能整个用不了 */
describe('记住上次选的档', () => {
  it('没存过时给默认档', () => {
    expect(parseStoredMarkOptions(null)).toEqual(DEFAULT_MARK_OPTIONS)
    expect(parseStoredMarkOptions('')).toEqual(DEFAULT_MARK_OPTIONS)
  })

  it('存了就读得回来', () => {
    expect(
      parseStoredMarkOptions(
        JSON.stringify({ level: 'ielts', amount: 'many', kinds: { word: false, phrase: true }, fill: false })
      )
    ).toEqual({
      level: 'ielts',
      amount: 'many',
      kinds: { word: false, phrase: true },
      fill: false
    })
  })

  it('老数据没有「划什么 / 填不填」这两格：当成两个都划、顺便填', () => {
    expect(parseStoredMarkOptions(JSON.stringify({ level: 'ielts', amount: 'many' }))).toEqual({
      level: 'ielts',
      amount: 'many',
      kinds: { word: true, phrase: true },
      fill: true
    })
  })

  it('「划什么」两个都关等于没得划，退回两个都开', () => {
    expect(
      parseStoredMarkOptions(JSON.stringify({ kinds: { word: false, phrase: false } })).kinds
    ).toEqual({ word: true, phrase: true })
  })

  it('存的值不认识时退回默认', () => {
    expect(parseStoredMarkOptions(JSON.stringify({ level: '八级', amount: 'x' }))).toEqual(
      DEFAULT_MARK_OPTIONS
    )
  })

  it('存的根本不是 JSON 时也不炸', () => {
    expect(parseStoredMarkOptions('{{{')).toEqual(DEFAULT_MARK_OPTIONS)
  })

  it('只存了一半时，另一半用默认', () => {
    expect(parseStoredMarkOptions(JSON.stringify({ level: 'cet6' }))).toEqual({
      level: 'cet6',
      amount: DEFAULT_MARK_OPTIONS.amount,
      kinds: DEFAULT_MARK_OPTIONS.kinds,
      fill: DEFAULT_MARK_OPTIONS.fill
    })
  })
})
