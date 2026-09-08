import { useCallback, useEffect, useRef, useState } from 'react'

/** 长按判定时长：超过这个时间不松手，就认为是「要标这个词」 */
const LONG_PRESS_MS = 450
/** 手指允许的移动范围：超过就认为用户在滚动页面，取消长按 */
const MOVE_TOLERANCE_PX = 10
/**
 * 按压底色至少亮多久。轻点往往不到 100ms 就松手，底色刚亮就灭，看着像没反应 ——
 * 松手时不够这个数就再留一会儿。只对「松手」生效：手指滑走（在滚动）照旧立刻灭
 */
const MIN_FLASH_MS = 160

interface WordInteractionOptions {
  /** 当前没有选中任何词时，长按某个词：开始一次标记 */
  onLongPress: (anchorId: string, word: string) => void
  /** 当前已有选中时，轻点某个词：连词成句 / 修正范围 / 取消选中 */
  onTapWithSelection: (anchorId: string, word: string) => void
  /**
   * 当前没有选中时，轻点某个词。不给就没反应（从前一直如此，避免正常阅读时误触）。
   * 设置里「点按单词发音」开了才给 —— 念一遍，不选中
   */
  onTap?: (anchorId: string, word: string) => void
  /** 当前是否已有选中 */
  hasSelection: boolean
  longPressMs?: number
}

interface WordHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerCancel: () => void
  onContextMenu: (e: React.SyntheticEvent) => void
}

interface WordInteractionResult {
  /** 生成某个单词的事件处理器 */
  getWordHandlers: (anchorId: string, word: string) => WordHandlers
  /** 当前正被按住的单词（用于显示按压反馈，让用户知道「按住有用」） */
  pressingAnchorId: string | null
  /** 顶栏提示文案 */
  interactionHint: string
}

/**
 * 单词的触摸交互。
 *
 * 设计成「长按取词」而不是「双击取词」，原因：
 * - 双击要靠自己掐 300ms 的表来判定，而这段时间里浏览器自己也在处理双击缩放、
 *   文字选择、点击延迟，三方抢同一个手势，结果就是时灵时不灵。
 * - 长按是移动端「对这段文字做点什么」的标准手势，不和上述任何行为冲突，
 *   而且手指一移动就能干净地退出（判定为滚动页面）。
 *
 * 用 Pointer 事件而非 Touch 事件，这样鼠标按住不放也能触发，方便在电脑浏览器里调试。
 */
export function useWordInteraction({
  onLongPress,
  onTapWithSelection,
  onTap,
  hasSelection,
  longPressMs = LONG_PRESS_MS
}: WordInteractionOptions): WordInteractionResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  /** 本次按压是否已经触发过长按（触发过就不再当作轻点处理） */
  const firedRef = useRef(false)
  const [pressingAnchorId, setPressingAnchorId] = useState<string | null>(null)
  /** 这次按下去是什么时候，算底色亮够了没有 */
  const pressedAtRef = useRef(0)
  /** 轻点太快时把底色多留一会儿的那个计时器 */
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFlash = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }, [])

  const cancelPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
    clearFlash()
    setPressingAnchorId(null)
  }, [clearFlash])

  /**
   * 松手：长按的表停掉，底色**留够 MIN_FLASH_MS 再灭**。
   * 和 cancelPress 的差别只在底色 —— 滑走是「用户在滚动」，该立刻灭；松手是「点了一下」，该让人看见
   */
  const releasePress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
    const left = MIN_FLASH_MS - (Date.now() - pressedAtRef.current)
    if (left <= 0) {
      setPressingAnchorId(null)
      return
    }
    clearFlash()
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null
      setPressingAnchorId(null)
    }, left)
  }, [clearFlash])

  // 组件卸载时清掉未完成的计时器
  useEffect(() => cancelPress, [cancelPress])

  const getWordHandlers = useCallback(
    (anchorId: string, word: string): WordHandlers => ({
      onPointerDown: (e: React.PointerEvent) => {
        // 只响应主键（触摸和左键）
        if (e.button !== 0) return
        firedRef.current = false
        startPosRef.current = { x: e.clientX, y: e.clientY }
        pressedAtRef.current = Date.now()
        clearFlash()
        setPressingAnchorId(anchorId)

        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          firedRef.current = true
          setPressingAnchorId(null)
          onLongPress(anchorId, word)
        }, longPressMs)
      },

      onPointerMove: (e: React.PointerEvent) => {
        const start = startPosRef.current
        if (!start) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        // 手指移动超过容差 = 用户在滚动，不是在按住这个词
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancelPress()
      },

      onPointerUp: () => {
        const wasLongPress = firedRef.current
        releasePress()
        firedRef.current = false
        // 长按已经处理过了，松手不再重复触发
        if (wasLongPress) return
        // 有选中时轻点：连词成句或修正范围。
        // 没有选中时轻点：默认无反应（避免正常阅读时误触）；开了「点按单词发音」才念一遍
        if (hasSelection) onTapWithSelection(anchorId, word)
        else onTap?.(anchorId, word)
      },

      onPointerCancel: cancelPress,

      // 长按时浏览器默认会弹出「复制 / 选择」菜单，这里挡掉
      onContextMenu: (e: React.SyntheticEvent) => e.preventDefault()
    }),
    [hasSelection, longPressMs, onLongPress, onTapWithSelection, onTap, cancelPress, releasePress, clearFlash]
  )

  const interactionHint = hasSelection
    ? '轻点其它单词可连成句子'
    : onTap
      ? '阅读模式 · 长按加笔记，点按发音'
      : '阅读模式 · 长按单词添加笔记'

  return { getWordHandlers, pressingAnchorId, interactionHint }
}
