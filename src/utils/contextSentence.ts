/**
 * 抽卡上的「原句」：从正文里把这条标注所在的那一句切出来，标注本身单独拎出来好高亮。
 *
 * 用户 2026-09-09 定的：复习不做考试，卡片带上原句是为了「把文章的骨架重读一遍」，
 * 所以这里**不藏词**，切出来的是完整的一句，词在句子里标出来。
 *
 * 「一句」的边界只认句号、问号、叹号（中英文都认）和省略号；英文的还要紧跟着空白或行尾
 * —— `3.14`、`e.g.` 中间的点不算。
 * 缩略语（Mr. / Dr. / 单个大写字母的缩写）后面的点也不算。
 * 认错了顶多多带半句或少带半句，卡片照样能看，不值得为它接一个真正的分句器。
 *
 * 导入的书一段就是一行、能占好几屏，所以切出来的一句两头还各有个长度上限，
 * 超了就在词边界截断、加省略号。
 */
import { parseAnchor } from './annotationOrder'
import type { WordRef } from './reconcile'

export interface ContextSentence {
  /** 句子里标注前面的那一截 */
  before: string
  /** 标注本身（按正文里的原样，含缩写后缀） */
  hit: string
  /** 标注后面的那一截 */
  after: string
}

/** 两头各最多留这么多字符，再长就截断 */
export const MAX_SIDE = 160

const TERMINATORS = '.!?。！？…'
/** 句末可能跟着的引号、括号 */
const CLOSERS = '"\'”’)）】」』'

/** 这些词后面的句号不是句末 */
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'sr', 'jr', 'vs', 'e.g', 'i.e'])

function isTerminator(c: string): boolean {
  return TERMINATORS.includes(c)
}

/** 第 i 个字符是句末标点：它后面（跳过收尾引号）是空白或行尾，而且前面不是缩略语 */
function isSentenceEnd(line: string, i: number): boolean {
  if (!isTerminator(line[i])) return false
  // 中文的句号后面不空格，本身就是句末
  if ('。！？'.includes(line[i])) return true
  let j = i + 1
  while (j < line.length && CLOSERS.includes(line[j])) j++
  if (j < line.length && !/\s/.test(line[j])) return false

  if (line[i] === '.') {
    // 往前取紧贴着的那个词
    let k = i - 1
    while (k >= 0 && /[a-zA-ZÀ-ÿ.]/.test(line[k])) k--
    const token = line.slice(k + 1, i).toLowerCase()
    if (token.length === 1) return false // J. K. Rowling
    if (ABBREVIATIONS.has(token)) return false
  }
  return true
}

/** 句子的起止：[起, 止)，包住 [from, to) 那一段 */
export function sentenceBounds(line: string, from: number, to: number): [number, number] {
  let start = 0
  for (let i = from - 1; i >= 0; i--) {
    if (isSentenceEnd(line, i)) {
      let s = i + 1
      while (s < line.length && CLOSERS.includes(line[s])) s++
      while (s < line.length && /\s/.test(line[s])) s++
      start = Math.min(s, from)
      break
    }
  }

  let end = line.length
  // 从标注的最后一个字符起找句末：标注自己末尾的句号（句摘常带着）也算
  for (let j = Math.max(to - 1, from); j < line.length; j++) {
    if (isSentenceEnd(line, j)) {
      let e = j + 1
      while (e < line.length && CLOSERS.includes(line[e])) e++
      end = Math.max(e, to)
      break
    }
  }
  return [start, end]
}

/** 前半截太长就只留靠近标注的那一段，在词边界截断 */
export function clipBefore(text: string, max = MAX_SIDE): string {
  if (text.length <= max) return text
  const cut = text.slice(text.length - max)
  const ws = cut.search(/\s/)
  return '…' + (ws === -1 ? cut : cut.slice(ws + 1))
}

/** 后半截太长就只留靠近标注的那一段，在词边界截断 */
export function clipAfter(text: string, max = MAX_SIDE): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const ws = cut.search(/\s\S*$/)
  return (ws === -1 ? cut : cut.slice(0, ws)) + '…'
}

/**
 * 从正文里切出这条标注所在的一句。
 *
 * `words` 是 buildWordList(content) 的结果，调用方按文档缓存，别每张卡重算。
 * 标注是孤儿（没坐标）、坐标在正文里找不到、行号超了：返回 null，卡上就不画原句。
 * 范围跨行的（短语划过了换行）：只取起点那一行，高亮从起点到这一句末尾。
 */
export function contextSentence(
  content: string,
  words: readonly WordRef[],
  start: string | null | undefined,
  end: string | null | undefined
): ContextSentence | null {
  const endAnchor = end ?? start
  if (!parseAnchor(start) || !parseAnchor(endAnchor)) return null

  let a = words.find((w) => w.anchorId === start)
  let b = words.find((w) => w.anchorId === endAnchor)
  if (!a || !b) return null
  if (a.line > b.line || (a.line === b.line && a.start > b.start)) [a, b] = [b, a]

  const lines = content.split(/\n/)
  const raw = lines[a.line]
  if (raw === undefined) return null
  const line = raw.replace(/\r$/, '')

  const from = a.start - (a.prefix?.length ?? 0)
  const sameLine = a.line === b.line
  const to = sameLine ? b.end + (b.suffix?.length ?? 0) : line.length
  const [s, e] = sentenceBounds(line, from, to)
  const hitEnd = sameLine ? to : e

  return {
    before: clipBefore(line.slice(s, from)),
    hit: line.slice(from, hitEnd),
    after: clipAfter(line.slice(hitEnd, e))
  }
}
