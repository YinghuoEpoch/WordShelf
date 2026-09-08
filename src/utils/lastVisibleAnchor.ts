/**
 * 「屏幕上最后一个还露着的单词」怎么挑 —— 只管挑法，量像素的事由调用方给。
 *
 * ## ⚠️ 为什么要一段一段往回退，而不是只退一段
 *
 * 第一版是「最后一个露着的 `<p>` 里一个词都没露，就退回上一段」。
 * 可 epub 导入的书**每两段之间都隔着一个空行**（epubParts.ts 规整成「最多留一个空行」），
 * 上一段正好是那个空 `<p>`，退过去还是一个词都没有 —— 于是报 null。
 *
 * 而「最后一个露着的 `<p>` 里一个词都没露」不是什么罕见事：`<p>` 的上沿刚进屏幕、
 * 第一个词的行内框还差半个行距才进来，这个窗口有 **5px 左右，每个段落边界都有一次**。
 * 报了 null，followScroll 那边就当「量不到，落在第一条」—— 用户看到的就是
 * 右侧栏**时不时窜到顶部一下再回来**（2026-09-08 报的，浏览器里复现了）。
 *
 * 现在从最后一个露着的段落起**一路往回退**，退到有词为止。空行、只有标点或数字的行
 * （`* * *`、章节号）、还没露出第一个词的段落，都跳得过去。
 *
 * ## 代价
 *
 * 露着的段落本来就只有几个；往回退只在最后那段没词时才发生，而且多半退一两段就停。
 * 每段的扫描仍是调用方那套（先看段落上沿、再逐词看），这里不额外量任何东西。
 *
 * @param paragraphs   正文段落，按正文顺序
 * @param isBelow      这一段的上沿是否已经掉到屏幕外（它和它后面的都不算露着）
 * @param lastWordIn   这一段里最后一个还露着的词的锚点；一个都没露给 null
 */
export function pickLastVisibleAnchor<P>(
  paragraphs: Iterable<P>,
  isBelow: (p: P) => boolean,
  lastWordIn: (p: P) => string | null
): string | null {
  const visible: P[] = []
  for (const p of paragraphs) {
    if (isBelow(p)) break
    visible.push(p)
  }
  for (let i = visible.length - 1; i >= 0; i--) {
    const id = lastWordIn(visible[i])
    if (id) return id
  }
  return null
}
