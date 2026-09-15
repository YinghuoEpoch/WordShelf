import { describe, it, expect } from 'vitest'
import { SAMPLE_TEXT, SAMPLE_NOTES, SAMPLE_SENTENCES } from './sampleData'
import { getEnglishWords } from './utils/tokenize'

/**
 * 示例正文的锚点是「第几行第几个词」，改一个字就可能挪位。
 * 这里把每个锚点解析回正文里的词，和笔记里写的对一遍。
 */
function wordAt(anchorId: string): string | undefined {
  const m = /^L(\d+)W(\d+)$/.exec(anchorId)
  if (!m) return undefined
  const lines = SAMPLE_TEXT.split('\n')
  return getEnglishWords(lines[Number(m[1])] ?? '')[Number(m[2])]
}

describe('sampleData 锚点', () => {
  it('每条示例生词的锚点指向正文里的那个词', () => {
    for (const [anchorId, note] of Object.entries(SAMPLE_NOTES)) {
      expect(wordAt(anchorId)?.toLowerCase(), anchorId).toBe(note.word.toLowerCase())
    }
  })

  it('示例句摘的首尾锚点落在句子的首尾词上', () => {
    for (const s of SAMPLE_SENTENCES) {
      const words = getEnglishWords(s.text)
      expect(wordAt(s.startAnchorId)?.toLowerCase(), s.id).toBe(words[0].toLowerCase())
      expect(wordAt(s.endAnchorId)?.toLowerCase(), s.id).toBe(words[words.length - 1].toLowerCase())
    }
  })

  it('正文里没有留着旧歌词', () => {
    expect(SAMPLE_TEXT).not.toMatch(/wish my life away/i)
  })
})
