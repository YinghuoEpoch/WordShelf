import type { ReaderSettings } from '../types'

/**
 * 三种纸色（标准 / 青灰 / 暖白）的配色表。
 *
 * 从前写在 `LyricEditor` 内部，所以主题只染得到阅读页，复习页底色是写死的。
 * 搬出来给两边共用，复习模式才能跟着换。
 *
 * 只管正文/卡片所在的那块滚动区，顶部的带和左右侧栏都不用它。
 *
 * `bgHex` 是同一个底色的裸值：阅读区把它挂成 `--reader-bg`，
 * 正文里两条挨着的范围线之间那个断口要用它把线头盖掉（index.css 的 .line-break-before）。
 */
export function readerThemeStyles(theme: ReaderSettings['theme']) {
  return theme === 'original'
    ? { bg: 'bg-[#f8f9f8]', bgHex: '#f8f9f8', text: 'text-[#2c3e34]', border: 'border-[#2c3e34]/12' }
    : theme === 'rice'
      ? { bg: 'bg-[#fffefc]', bgHex: '#fffefc', text: 'text-[#333333]', border: 'border-accent-900/10' }
      : { bg: 'bg-white', bgHex: '#ffffff', text: 'text-gray-900', border: 'border-gray-200' }
}
