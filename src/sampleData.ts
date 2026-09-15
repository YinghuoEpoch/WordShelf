import type { Sentence } from './types'

export const SAMPLE_BOOK_ID = 'sample-book'
export const SAMPLE_PAGE_ID = 'sample-page'

export const SAMPLE_PAGE_TITLE = 'Hope is the thing with feathers'

/**
 * 示例正文：Emily Dickinson 的《"Hope" is the thing with feathers》（1861），
 * 作者 1886 年去世，全世界都是公共领域。一行英文一行中文，中文是我们自己译的。
 *
 * 2026-09-15 换的。之前放的是一首游戏插曲的歌词，没有版权，
 * 上架前必须换掉 —— 付费 App 里带着别人的歌词，一封投诉信就能让商店下架。
 *
 * ⚠️ 下面 SAMPLE_NOTES / SAMPLE_SENTENCES 的锚点是「第几行第几个词」，
 * 改一行字就可能挪位；sampleData.test.ts 会核对每个锚点指向的词，改完跑一遍测试。
 */
export const SAMPLE_TEXT = `"Hope" is the thing with feathers -
「希望」是长着羽毛的东西 —
That perches in the soul -
它栖在灵魂里 —
And sings the tune without the words -
唱着没有歌词的曲调 —
And never stops - at all -
从不停歇 — 永不 —
And sweetest - in the Gale - is heard -
在狂风里 — 听来最甜 —
And sore must be the storm -
那风暴该多么凶 —
That could abash the little Bird
才能让这只小鸟慌乱
That kept so many warm -
它曾温暖过那么多人 —
I've heard it in the chillest land -
我在最寒冷的土地上听过它 —
And on the strangest Sea -
在最陌生的海上 —
Yet - never - in Extremity,
可它 — 从未 — 哪怕在绝境里，
It asked a crumb - of me.
向我讨过一粒面包屑。
—— Emily Dickinson，1861`

/** 示例生词：按文中行号与单词序号 L行号W词序（行号从 0 起，中文行也占号） */
export const SAMPLE_NOTES: Record<string, { word: string; phonetic?: string; pos?: string; definition?: string }> = {
  'L2W1': { word: 'perches', phonetic: '/ˈpɜːrtʃɪz/', pos: 'v.', definition: '栖息；停歇（perch 第三人称单数）' },
  'L8W4': { word: 'Gale', phonetic: '/ɡeɪl/', pos: 'n.', definition: '大风；狂风' },
  'L12W2': { word: 'abash', phonetic: '/əˈbæʃ/', pos: 'v.', definition: '使窘迫；使慌乱' },
  'L22W3': { word: 'crumb', phonetic: '/krʌm/', pos: 'n.', definition: '面包屑；一点点' }
}

const sampleDate = 1700000000000

/** 示例句摘：It asked a crumb - of me.，带句型与翻译笔记 */
export const SAMPLE_SENTENCES: Sentence[] = [
  {
    id: 'sample-s1',
    text: 'It asked a crumb - of me.',
    grammar: 'ask sth. of sb.：向某人索求某物。这里 a crumb 是「一点点」，整句是「向我讨过哪怕一点点」。',
    meaning: '向我讨过一粒面包屑 / 希望从不向人索取回报。',
    docId: SAMPLE_PAGE_ID,
    // 第 22 行（0 起算），英文行 "It asked a crumb - of me."，六个词
    startAnchorId: 'L22W0',
    endAnchorId: 'L22W5',
    date: sampleDate
  }
]
