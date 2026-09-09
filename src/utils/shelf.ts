/**
 * 「这条文库 / 文档还在目录里吗」—— 全 app 只在这里判一次。
 *
 * 不在目录里的有两种：回收站（deletedAt）和归档（archivedAt）。
 * 从前只有回收站，`!x.deletedAt` 散在八个地方（目录、复习汇总、高频生词、AI 填充、
 * 当前文档跳开……）。加归档时要是再散八处，就是第六十九节那个「N 个平行登记处」的坑。
 * 现在全部改问这一个函数：归档和回收站从此同进同出。
 *
 * 回收站优先于归档：一条既归档又进了回收站的，算回收站的（先归档、后把文库删了会出现）。
 */
export interface Shelvable {
  deletedAt?: number
  archivedAt?: number
}

export function isOnShelf(x: Shelvable): boolean {
  return !x.deletedAt && !x.archivedAt
}

export function isInTrash(x: Shelvable): boolean {
  return !!x.deletedAt
}

export function isArchived(x: Shelvable): boolean {
  return !!x.archivedAt && !x.deletedAt
}
