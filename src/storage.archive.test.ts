import { describe, it, expect, vi } from 'vitest'
import type { AppData } from './types'
import { isArchived, isOnShelf } from './utils/shelf'

/**
 * 归档 / 取出。做法照抄回收站，所以测的重点是**和回收站不一样的那几处**：
 * 取出时原文库还在归档里怎么办、归档和回收站撞上怎么办。
 *
 * localforage 换成内存里的 Map，每个用例重新载入模块（storage.ts 有模块级 cache），
 * 和 storage.emptyTrash.test.ts 同一招。
 */
vi.mock('localforage', () => {
  const store = new Map<string, unknown>()
  return {
    default: {
      getItem: async (k: string) => (store.has(k) ? store.get(k) : null),
      setItem: async (k: string, v: unknown) => {
        store.set(k, v)
        return v
      }
    }
  }
})

const KEY = 'lyric-vocab-data'
const book = (id: string, extra: object = {}) => ({ id, name: id, createdAt: 0, ...extra })
const page = (id: string, bookId: string | null = null, extra: object = {}) => ({
  id,
  bookId,
  title: id,
  content: '',
  updatedAt: 0,
  ...extra
})

async function fresh(seed: Partial<AppData>) {
  vi.resetModules()
  const localforage = (await import('localforage')).default
  await localforage.setItem(KEY, { books: [], pages: [], notes: {}, ...seed })
  return await import('./storage')
}

describe('归档', () => {
  it('归档文库：文库和它下面的文档一起打戳，别的文档不动', async () => {
    const s = await fresh({
      books: [book('b1'), book('b2')],
      pages: [page('p1', 'b1'), page('p2', 'b2'), page('p3', null)]
    })
    const data = await s.archiveBook('b1')
    expect(data.books.map((b) => isArchived(b))).toEqual([true, false])
    expect(data.pages.map((p) => isArchived(p))).toEqual([true, false, false])
    expect(data.books.map((b) => isOnShelf(b))).toEqual([false, true])
  })

  it('归档单篇：只打那一篇，文库不动', async () => {
    const s = await fresh({ books: [book('b1')], pages: [page('p1', 'b1'), page('p2', 'b1')] })
    const data = await s.archivePage('p1')
    expect(isArchived(data.books[0])).toBe(false)
    expect(data.pages.map((p) => isArchived(p))).toEqual([true, false])
  })

  it('归档不是删除：数组里一条不少，笔记和标注原样', async () => {
    const s = await fresh({
      books: [book('b1')],
      pages: [page('p1', 'b1')],
      notes: { p1: { L0W0: { word: 'x' } } }
    })
    const data = await s.archiveBook('b1')
    expect(data.books).toHaveLength(1)
    expect(data.pages).toHaveLength(1)
    expect(data.notes.p1).toBeTruthy()
  })
})

describe('取出', () => {
  it('取出文库：文库和它下面的文档一起回来', async () => {
    const s = await fresh({
      books: [book('b1', { archivedAt: 1 })],
      pages: [page('p1', 'b1', { archivedAt: 1 }), page('p2', 'b1', { archivedAt: 1 })]
    })
    const data = await s.unarchiveBook('b1')
    expect(isOnShelf(data.books[0])).toBe(true)
    expect(data.pages.every((p) => isOnShelf(p))).toBe(true)
    expect(data.pages.every((p) => p.bookId === 'b1')).toBe(true)
  })

  it('取出单篇，原文库还在架上：回到原文库', async () => {
    const s = await fresh({ books: [book('b1')], pages: [page('p1', 'b1', { archivedAt: 1 })] })
    const data = await s.unarchivePage('p1')
    expect(data.pages[0].bookId).toBe('b1')
    expect(isOnShelf(data.pages[0])).toBe(true)
  })

  it('⚠️ 取出单篇，原文库还在归档里：文档回到根级，文库照旧归档', async () => {
    const s = await fresh({
      books: [book('b1', { archivedAt: 1 })],
      pages: [page('p1', 'b1', { archivedAt: 1 })]
    })
    const data = await s.unarchivePage('p1')
    expect(data.pages[0].bookId).toBeNull()
    expect(isOnShelf(data.pages[0])).toBe(true)
    expect(isArchived(data.books[0])).toBe(true)
  })

  it('取出单篇，原文库在回收站：同样回到根级', async () => {
    const s = await fresh({
      books: [book('b1', { deletedAt: 1 })],
      pages: [page('p1', 'b1', { archivedAt: 1 })]
    })
    const data = await s.unarchivePage('p1')
    expect(data.pages[0].bookId).toBeNull()
  })
})

describe('归档和回收站撞上', () => {
  it('回收站恢复的文档，原文库在归档里：回到根级（restorePage 现在也问 isOnShelf）', async () => {
    const s = await fresh({
      books: [book('b1', { archivedAt: 1 })],
      pages: [page('p1', 'b1', { deletedAt: 2 })]
    })
    const data = await s.restorePage('p1')
    expect(data.pages[0].bookId).toBeNull()
    expect(isOnShelf(data.pages[0])).toBe(true)
  })

  it('归档着的文库被移进回收站再恢复：归档戳还在，它仍在归档里而不是目录里', async () => {
    const s = await fresh({
      books: [book('b1', { archivedAt: 1 })],
      pages: [page('p1', 'b1', { archivedAt: 1 })]
    })
    await s.moveBookToTrash('b1')
    const data = await s.restoreBook('b1')
    expect(isArchived(data.books[0])).toBe(true)
    expect(isArchived(data.pages[0])).toBe(true)
  })

  it('清空回收站会把归档着又被删的一起清掉 —— 回收站优先', async () => {
    const s = await fresh({
      books: [book('b1', { archivedAt: 1, deletedAt: 2 }), book('b2', { archivedAt: 1 })],
      pages: []
    })
    const data = await s.emptyTrash()
    expect(data.books.map((b) => b.id)).toEqual(['b2'])
  })
})
