import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './openaiCompatible'
import { DEFAULT_MARK_OPTIONS } from './options'
import { DEFINITION_SPEC, LEMMA_SPEC, PHRASE_USAGE_SPEC, PHONETIC_SPEC } from '../enrich/fieldSpecs'

/**
 * 划词和填充是两条独立的提示词，却往同一批格子里写字 —— 各写各的会走样。
 * 已经走样过一次：填充要求「不是原形就在释义末尾补上原形」，划词没这一条，
 * 于是同一本书里两种写法混着出现。这里钉住「两边用的是同一份要求」。
 */
describe('划词的提示词', () => {
  const prompt = buildSystemPrompt(DEFAULT_MARK_OPTIONS)

  it('单词释义的要求和「一键填充」是同一份', () => {
    expect(prompt).toContain(DEFINITION_SPEC)
  })

  it('要原形（lemma），和「一键填充」一致', () => {
    expect(prompt).toContain(LEMMA_SPEC)
    expect(prompt).toContain('补上原形')
  })

  it('短语用法的要求也是同一份', () => {
    expect(prompt).toContain(PHRASE_USAGE_SPEC)
  })

  it('难度档和数量档都写进了提示词', () => {
    expect(buildSystemPrompt({ ...DEFAULT_MARK_OPTIONS, level: 'ielts', amount: 'many' })).toContain('雅思')
    expect(buildSystemPrompt({ ...DEFAULT_MARK_OPTIONS, level: 'cet6', amount: 'medium' })).toContain(
      '30 到 40 条'
    )
  })

  it('「照抄原文写法」这条硬要求还在 —— 定位全靠它', () => {
    expect(prompt).toContain('原文里的确切写法')
    expect(prompt).toContain('took off')
  })
})

/**
 * 「划什么 / 填不填」是用户 2026-09-08 加的。提示词要跟着变：
 * 只划一种就明说另一种不要；只划不填就一个字段都别要 —— 示例也得对得上，
 * 不然模型照示例来，要求里没有的释义照样给。
 */
describe('划什么 / 填不填', () => {
  it('只划单词：明说不要短语，短语那几项和示例都不出现', () => {
    const p = buildSystemPrompt({ ...DEFAULT_MARK_OPTIONS, kinds: { word: true, phrase: false } })
    expect(p).toContain('不要挑短语')
    expect(p).not.toContain(PHRASE_USAGE_SPEC)
    expect(p).not.toContain('"kind":"phrase"')
    expect(p).toContain(PHONETIC_SPEC)
  })

  it('只划短语：明说不要单词，单词那几项和示例都不出现', () => {
    const p = buildSystemPrompt({ ...DEFAULT_MARK_OPTIONS, kinds: { word: false, phrase: true } })
    expect(p).toContain('不要挑单个单词')
    expect(p).not.toContain(PHONETIC_SPEC)
    expect(p).not.toContain('"kind":"word"')
    expect(p).toContain(PHRASE_USAGE_SPEC)
  })

  it('两种都划：两边的要求都在', () => {
    const p = buildSystemPrompt(DEFAULT_MARK_OPTIONS)
    expect(p).toContain(PHONETIC_SPEC)
    expect(p).toContain(PHRASE_USAGE_SPEC)
  })

  it('只划不填：一个内容字段都不要，示例里也没有释义', () => {
    const p = buildSystemPrompt({ ...DEFAULT_MARK_OPTIONS, fill: false })
    expect(p).toContain('不要写释义')
    expect(p).not.toContain(PHONETIC_SPEC)
    expect(p).not.toContain(DEFINITION_SPEC)
    expect(p).not.toContain(PHRASE_USAGE_SPEC)
    expect(p).not.toContain('"definition"')
    expect(p).toContain('"kind":"word"')
    expect(p).toContain('"kind":"phrase"')
    // 「照抄原文」那条硬要求不因为不填就丢了
    expect(p).toContain('原文里的确切写法')
  })
})
