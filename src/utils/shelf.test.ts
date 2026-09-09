import { describe, it, expect } from 'vitest'
import { isArchived, isInTrash, isOnShelf } from './shelf'

describe('在架上 / 回收站 / 归档，三者互斥', () => {
  it('什么戳都没有：在架上', () => {
    expect(isOnShelf({})).toBe(true)
    expect(isInTrash({})).toBe(false)
    expect(isArchived({})).toBe(false)
  })

  it('归档了：不在架上，算归档', () => {
    const x = { archivedAt: 1 }
    expect(isOnShelf(x)).toBe(false)
    expect(isArchived(x)).toBe(true)
    expect(isInTrash(x)).toBe(false)
  })

  it('既归档又进了回收站：算回收站的，归档列表里不出现', () => {
    const x = { archivedAt: 1, deletedAt: 2 }
    expect(isOnShelf(x)).toBe(false)
    expect(isInTrash(x)).toBe(true)
    expect(isArchived(x)).toBe(false)
  })
})
