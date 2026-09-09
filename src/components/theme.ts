import type { PaperTheme, ReaderSettings } from '../types'

/**
 * 纸色表：正文 / 卡片所在那块滚动区的底色和字色。
 *
 * 从前只有三种，写死在 `readerThemeStyles` 的三元里；用户 2026-09-09 嫌少，
 * 而且设置里那排按钮是白的、看不出各自是什么色。现在收成一张表：
 * `bg` / `text` 是裸色值，给设置里的色块按钮自己涂上用；`styles` 是 Tailwind 类，
 * 给阅读页和复习页用（两边共用，第三十八节）。
 *
 * ⚠️ 类名里的 `bg-[#xxx]` 那种任意值必须**原样写在这里**，Tailwind 扫源码才生成得出来，
 * 拼字符串它认不到。
 *
 * 只管正文/卡片所在的那块滚动区，顶部的带和左右侧栏都不用它。
 * 一律浅色 —— 卡片、弹窗那些还是白底，深色纸配不上它们。
 */
export interface Paper {
  id: PaperTheme
  label: string
  /** 底色，裸值 */
  bg: string
  /** 字色，裸值 */
  text: string
  styles: { bg: string; text: string; border: string }
}

export const PAPERS: readonly Paper[] = [
  {
    id: 'pure',
    label: '标准',
    bg: '#ffffff',
    text: '#111827',
    styles: { bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200' }
  },
  {
    id: 'original',
    label: '青灰',
    bg: '#f8f9f8',
    text: '#2c3e34',
    styles: { bg: 'bg-[#f8f9f8]', text: 'text-[#2c3e34]', border: 'border-[#2c3e34]/12' }
  },
  {
    id: 'rice',
    label: '暖白',
    bg: '#fffefc',
    text: '#333333',
    styles: { bg: 'bg-[#fffefc]', text: 'text-[#333333]', border: 'border-accent-900/10' }
  },
  {
    id: 'cream',
    label: '米黄',
    bg: '#f8f3e6',
    text: '#3b3630',
    styles: { bg: 'bg-[#f8f3e6]', text: 'text-[#3b3630]', border: 'border-[#3b3630]/12' }
  },
  {
    id: 'sepia',
    label: '羊皮',
    bg: '#f2e8d5',
    text: '#4a3b2a',
    styles: { bg: 'bg-[#f2e8d5]', text: 'text-[#4a3b2a]', border: 'border-[#4a3b2a]/12' }
  },
  {
    id: 'mint',
    label: '薄荷',
    bg: '#edf4ee',
    text: '#243b2e',
    styles: { bg: 'bg-[#edf4ee]', text: 'text-[#243b2e]', border: 'border-[#243b2e]/12' }
  },
  {
    id: 'gray',
    label: '浅灰',
    bg: '#ebebe9',
    text: '#2a2a2a',
    styles: { bg: 'bg-[#ebebe9]', text: 'text-[#2a2a2a]', border: 'border-[#2a2a2a]/12' }
  }
]

export function isPaperTheme(x: unknown): x is PaperTheme {
  return PAPERS.some((p) => p.id === x)
}

export function paperOf(theme: PaperTheme): Paper {
  return PAPERS.find((p) => p.id === theme) ?? PAPERS[0]
}

/** 阅读页 / 复习页那块滚动区用的类名 */
export function readerThemeStyles(theme: ReaderSettings['theme']) {
  return paperOf(theme).styles
}
