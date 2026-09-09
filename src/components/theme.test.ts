import { describe, it, expect } from 'vitest'
import { PAPERS, isPaperTheme, paperOf, readerThemeStyles } from './theme'

describe('纸色表', () => {
  it('七档，id 不重复，老的三档还在原位', () => {
    const ids = PAPERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 3)).toEqual(['pure', 'original', 'rice'])
    expect(ids.length).toBe(7)
  })

  it('色块按钮用的裸色值和阅读区用的类名是同一个色 —— 两处对不上就是「按钮骗人」', () => {
    for (const p of PAPERS) {
      expect(p.bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.text).toMatch(/^#[0-9a-f]{6}$/)
      // bg-white 是 #ffffff 的别名；其余都得把同一个 hex 写进类名里
      const cls = p.styles.bg === 'bg-white' ? '#ffffff' : p.styles.bg
      expect(cls).toContain(p.bg)
      if (p.styles.text.startsWith('text-[')) expect(p.styles.text).toContain(p.text)
    }
  })

  it('认 id：表里的认，别的不认', () => {
    expect(isPaperTheme('sepia')).toBe(true)
    expect(isPaperTheme('pure')).toBe(true)
    expect(isPaperTheme('light')).toBe(false)
    expect(isPaperTheme(undefined)).toBe(false)
  })

  it('readerThemeStyles 就是表里那一格', () => {
    expect(readerThemeStyles('mint')).toBe(paperOf('mint').styles)
    expect(readerThemeStyles('pure').bg).toBe('bg-white')
  })
})
