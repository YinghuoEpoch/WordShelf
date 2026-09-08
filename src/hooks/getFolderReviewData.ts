import type { Annotation, LyricPage } from '../types'
import { isOrphanAnnotation } from '../types'
import { sortByText } from '../utils/annotationOrder'

export interface FolderVocabItem {
  id: string
  /**
   * 这条合并卡底下压着的全部标注。文库复习一律不给删（一张卡可能横跨几篇，
   * 删了看不见删的是哪几处）；单篇复习按它一次删掉这篇里的全部几处。
   */
  ids: string[]
  /** 单词还是短语。短语的卡片不显示音标/词性，改显示「用法」 */
  kind: 'word' | 'phrase'
  pageId: string
  pageTitle: string
  word: string
  phonetic?: string
  pos?: string
  definition?: string
  /** 短语的用法 / 搭配（存在标注的 grammar 字段里） */
  usage?: string
  /**
   * 「正文已改」的记号（短语才有）。**只在这张卡底下只有一条标注时带**：
   * 合并了几处之后，改过的也许只是其中一处，挂上记号用户不知道说的是哪一处。
   */
  sourceText?: string
  /** 原文已删除 / 由 AI 填充：文库模式的卡片也要显示这些标记 */
  orphaned?: boolean
  auto?: boolean
  frequency: number
}

/**
 * 按拼写把一串标注合并成卡：同一个词出现几次就记几次。
 * 输入已经按正文顺序排好，输出的次序是**第一次出现**的次序，两种范围（文库 / 单篇）共用。
 */
function mergeByWord(
  sorted: Annotation[],
  titleOf: (docId: string) => string
): FolderVocabItem[] {
  const byWord = new Map<string, FolderVocabItem>()

  for (const a of sorted) {
    const key = a.text.trim().toLowerCase()
    if (!key) continue
    const existing = byWord.get(key)
    if (!existing) {
      byWord.set(key, {
        id: `${a.docId}-${key}`,
        ids: [a.id],
        kind: a.type === 'phrase' ? 'phrase' : 'word',
        pageId: a.docId,
        pageTitle: titleOf(a.docId),
        word: a.text,
        phonetic: a.phonetic,
        pos: a.pos,
        definition: a.definition,
        usage: a.grammar,
        sourceText: a.sourceText,
        orphaned: isOrphanAnnotation(a) || undefined,
        auto: a.auto,
        frequency: 1
      })
    } else {
      existing.frequency += 1
      existing.ids.push(a.id)
      // 保留第一次出现的定义/音标/词性即可，后续冲突忽略；「正文已改」的记号见上面的说明
      existing.sourceText = undefined
    }
  }

  return Array.from(byWord.values())
}

/**
 * 文库级复习：把该文库下所有文档的生词按拼写合并，统计出现次数。
 *
 * 注意这里的条目是**合并出来的**，不是某一条标注本身 ——
 * 同一个词在三篇文档里各标过一次，这里只出现一条、频次记 3。
 *
 * 文库范围里不带「正文已改」的记号：同一条底下可能压着三篇文档里的三处标注，
 * 改过的也许只有其中一处，显示「原句：xxx」用户没法知道说的是哪一处。
 * 想看是哪一处改了，进那篇文档的单篇复习。
 */
export function getFolderReviewData(
  bookId: string,
  pages: LyricPage[],
  annotations: Annotation[]
): { high: FolderVocabItem[]; normal: FolderVocabItem[] } {
  const pagesInBook = pages.filter((p) => p.bookId === bookId && !p.deletedAt)
  const titleOf = new Map(pagesInBook.map((p) => [p.id, p.title || '未命名']))

  const inBook = sortByText(
    annotations.filter((a) => a.type !== 'sentence' && titleOf.has(a.docId) && a.text)
  )

  const all = mergeByWord(inBook, (id) => titleOf.get(id) ?? '未命名').map((i) => ({
    ...i,
    sourceText: undefined
  }))
  const high = all
    .filter((i) => i.frequency > 1)
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency
      return a.word.localeCompare(b.word)
    })

  const normal = all
    .filter((i) => i.frequency === 1)
    .sort((a, b) => a.word.localeCompare(b.word))

  return { high, normal }
}

/**
 * 单篇复习：同一篇里划了不止一次的词合并成一张卡，记下次数（用户 2026-09-08 提的，
 * 「文库那个汇总重复生词的功能，文档也要」）。
 *
 * 和文库那套的两处不同，都是因为这里只有一篇：
 *
 * - **次序按正文**，不按字母 —— 单篇本来就是按正文顺序复习的，没重复的词一个都不挪。
 *   高频那一组按次数从多到少，次数相同的按第一次出现的位置
 * - **只出现一次的卡带着「正文已改」的记号**，和从前单篇复习一样；合并卡不带
 */
export function getPageReviewData(
  pageId: string,
  pages: LyricPage[],
  annotations: Annotation[]
): { high: FolderVocabItem[]; normal: FolderVocabItem[] } {
  const title = pages.find((p) => p.id === pageId)?.title || '未命名'
  const inPage = sortByText(
    annotations.filter((a) => a.docId === pageId && a.type !== 'sentence' && a.text)
  )
  const all = mergeByWord(inPage, () => title)
  // sort 是稳定的：次数相同的保持第一次出现的次序
  const high = all.filter((i) => i.frequency > 1).sort((a, b) => b.frequency - a.frequency)
  const normal = all.filter((i) => i.frequency === 1)
  return { high, normal }
}
