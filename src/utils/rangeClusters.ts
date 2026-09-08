import type { EdgeSegment } from './punctuation'

/**
 * 正文里一行的「范围线」分簇：句摘的虚线、短语的波浪线都用它算覆盖范围。
 *
 * 从前这一步只有一个「被谁划过」的集合，相邻的两条范围（前一句划完接着划下一句、
 * 两个挨着的短语）在集合里分不出彼此，于是被并成一整簇，中间那个空格也一并盖上，
 * 两条线接成一条（用户 2026-09-09 报的）。
 *
 * 现在每个词记的是「被哪几条范围盖着」：**相邻两个词只要共享至少一条范围就在同一簇**，
 * 否则断开。断开的两簇之间若只隔着空格、标点（没有任何没划过的词），
 * 单靠那一个空格的宽度分不出两条线 —— 虚线本身的间隔就有 0.2em，空格才 0.25em ——
 * 所以后一簇还要打上 `breakBefore`，让线的起点再往里让一截。
 *
 * 重叠或嵌套的两条范围（共享着词）仍是一簇，那本来就分不开。
 */
export interface ClusterMask {
  /** 每一段属于第几簇；0 = 不在任何范围里。簇号按出现顺序从 1 起 */
  cluster: number[]
  /** 这一段是某一簇的第一段，而且前一簇和它之间没有隔着没划过的词 */
  breakBefore: boolean[]
}

/** 每个 anchorId 被哪几条范围盖着（范围的编号随便，只要同一条范围用同一个号） */
export type CoverMap = ReadonlyMap<string, readonly number[]>

const shares = (a: readonly number[], b: readonly number[]) => a.some((x) => b.includes(x))

export function clusterMask(
  segments: readonly EdgeSegment[],
  anchorIdAt: (wordIndex: number) => string,
  cover: CoverMap,
  /**
   * 要不要连两头紧贴的标点一起盖：句摘要（存下来的原文就带着引号句号），
   * 短语不要（存进去的两头是剥干净的，线比字长就对不上了）。
   */
  withEdges: boolean
): ClusterMask {
  const cluster = new Array<number>(segments.length).fill(0)
  const breakBefore = new Array<boolean>(segments.length).fill(false)
  if (cover.size === 0) return { cluster, breakBefore }

  let nextId = 1
  let wordIndex = 0
  let clusterStart: number | null = null
  let clusterEnd: number | null = null
  let prevRanges: readonly number[] = []
  /** 上一簇收掉之后，有没有经过一个没划过的词 */
  let seenBareWord = false
  let hadCluster = false

  const flush = () => {
    if (clusterStart === null || clusterEnd === null) return
    let lo = clusterStart
    let hi = clusterEnd
    if (withEdges) {
      if (lo > 0 && segments[lo - 1].edge === 'open') lo--
      if (hi < segments.length - 1 && segments[hi + 1].edge === 'close') hi++
    }
    const id = nextId++
    for (let k = lo; k <= hi; k++) cluster[k] = id
    breakBefore[lo] = hadCluster && !seenBareWord
    hadCluster = true
    seenBareWord = false
    clusterStart = null
    clusterEnd = null
    prevRanges = []
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type !== 'en') continue
    const ranges = cover.get(anchorIdAt(wordIndex)) ?? []
    wordIndex++
    if (ranges.length === 0) {
      flush()
      seenBareWord = true
      continue
    }
    if (clusterStart !== null && !shares(prevRanges, ranges)) flush()
    if (clusterStart === null) clusterStart = i
    clusterEnd = i
    prevRanges = ranges
  }
  flush()
  return { cluster, breakBefore }
}

/**
 * 把「一批范围」摊成每个词被哪几条范围盖着。
 * `orderedWords` 是正文里全部的词（按文档顺序），范围按起止 anchorId 在里面定位；
 * 定位不到（孤儿）的跳过。
 */
export function buildCoverMap(
  ranges: ReadonlyArray<{ startAnchorId: string; endAnchorId: string; orphaned?: boolean }>,
  orderedWords: ReadonlyArray<{ anchorId: string }>
): CoverMap {
  const map = new Map<string, number[]>()
  if (ranges.length === 0) return map
  const indexOf = new Map<string, number>()
  orderedWords.forEach((w, i) => indexOf.set(w.anchorId, i))
  ranges.forEach((r, n) => {
    if (r.orphaned) return
    const i = indexOf.get(r.startAnchorId)
    const j = indexOf.get(r.endAnchorId)
    if (i === undefined || j === undefined) return
    const [lo, hi] = i <= j ? [i, j] : [j, i]
    for (let k = lo; k <= hi; k++) {
      const id = orderedWords[k].anchorId
      const list = map.get(id)
      if (list) list.push(n)
      else map.set(id, [n])
    }
  })
  return map
}
