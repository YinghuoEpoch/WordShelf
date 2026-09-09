/**
 * 抽卡翻到第几张，退出再进来接着翻（用户 2026-09-09 要的：「每次退出抽卡模式阅读进度都会消失」）。
 *
 * 按「哪一篇 / 哪个文库 + 词还是句」各记一格，**存本机 localStorage，不进云端同步**：
 * 同步那一摊是不动的地基，而且两台机器各有各的翻卡位置也说得通（阅读进度也是这么办的）。
 *
 * 过完了（翻到「过完了」那一屏）就把这一格删掉，再进来从头开始。
 */

const KEY = 'lyric-vocab:flash-position'

export type FlashPositionMap = Record<string, number>

/** 一叠卡的键：复习范围 + 词/句 */
export function deckKey(target: { type: 'page' | 'book'; id: string }, mode: 'vocab' | 'sentence'): string {
  return `${target.type}:${target.id}:${mode}`
}

/** 从存下来的那串字读出这张表；读不出来（没存过、被改坏了）就是空表 */
export function parseFlashPositions(raw: string | null | undefined): FlashPositionMap {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: FlashPositionMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * 记下来的位置放到今天这叠卡上该是第几张。
 * 卡少了（删过几条）存的数超出去就从头来；没记过也从头来。
 */
export function clampPosition(stored: number | undefined, total: number): number {
  if (stored === undefined || total <= 0) return 0
  return stored < total ? stored : 0
}

/**
 * 存一次。index 到了 total（「过完了」那一屏）就删掉这一格。
 * 返回改过的表，方便测试；真正落盘在 saveFlashPosition。
 */
export function withPosition(map: FlashPositionMap, key: string, index: number, total: number): FlashPositionMap {
  const next = { ...map }
  if (index >= total || index <= 0) delete next[key]
  else next[key] = index
  return next
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function storage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function loadFlashPosition(key: string, total: number, store: StorageLike | null = storage()): number {
  if (!store) return 0
  try {
    return clampPosition(parseFlashPositions(store.getItem(KEY))[key], total)
  } catch {
    return 0
  }
}

export function saveFlashPosition(key: string, index: number, total: number, store: StorageLike | null = storage()): void {
  if (!store) return
  try {
    const map = parseFlashPositions(store.getItem(KEY))
    store.setItem(KEY, JSON.stringify(withPosition(map, key, index, total)))
  } catch {
    // 存不下就算了，下次进来从头翻，不值得报错
  }
}
