import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AutoMark } from './AutoMark'
import { SpeakButton } from './SpeakButton'
import { DIRECTION_SLOP, isHorizontalSwipe } from './SwipeToDelete'
import type { ContextSentence } from '../utils/contextSentence'

/**
 * 抽卡：复习页的另一种翻法 —— 一次只看一张，铺满中间，左右滑或点箭头换下一张。
 *
 * 用户 2026-09-09 定的口径：**不是考试**。他不喜欢复习，读法是「读完过一遍，然后读更多，
 * 读得多了自然记住高频的」。所以这里没有「认识 / 不认识」的打分、不记分、不存任何东西，
 * 滑到底就是「过完了」。它给的是节奏和终点，卡片墙给不了这两样。
 *
 * 一次只显示一张，所以卡片可以带上**原句**（词在句子里高亮）—— 卡片墙上这样做太高，
 * 一屏放不下几张；这里屏幕本来就只给它一张。
 *
 * 遮罩（隐藏英文 / 中文）和卡片墙同一套开关，点卡片翻开。
 */

export interface CardAnchor {
  docId: string
  start: string | null
  end: string | null
}

export type FlashCard =
  | {
      kind: 'vocab'
      id: string
      word: string
      isPhrase: boolean
      phonetic?: string
      pos?: string
      definition?: string
      usage?: string
      auto?: boolean
      orphaned?: boolean
      pageTitle: string
      /** 去正文里找原句用。孤儿没有 */
      anchor: CardAnchor | null
    }
  | {
      kind: 'sentence'
      id: string
      text: string
      grammar: string
      meaning: string
      auto?: boolean
      orphaned?: boolean
      pageTitle: string
    }

interface FlashDeckProps {
  cards: FlashCard[]
  /** 文库复习时卡上写「出自哪一篇」；单篇复习不用，本来就是这一篇 */
  showSource: boolean
  /** 过完了那一屏用：「这一篇」「这个文库」 */
  scopeLabel: string
  hideEnglish: boolean
  hideChinese: boolean
  canSpeak: boolean
  speakingId: string | null
  onSpeak: (card: FlashCard) => void
  contextOf: (anchor: CardAnchor) => ContextSentence | null
  onExit: () => void
  /** 底部让出导航栏的那段内边距，和卡片墙同一个式子 */
  paddingBottom: string
}

/** 划过这么远（px），松手就换下一张 */
export const SWIPE_PX = 64

/** 手指走了 dx，卡片跟着挪多少：过了触发线之后越拉越沉，别让卡片飞出屏幕 */
export function dragOffset(dx: number, trigger = SWIPE_PX): number {
  const abs = Math.abs(dx)
  if (abs <= trigger) return dx
  const extra = (abs - trigger) / 3
  return Math.sign(dx) * (trigger + extra)
}

/** 松手时该往哪翻：-1 上一张、1 下一张、0 弹回 */
export function swipeDirection(dx: number, trigger = SWIPE_PX): -1 | 0 | 1 {
  if (dx <= -trigger) return 1
  if (dx >= trigger) return -1
  return 0
}

export function FlashDeck({
  cards,
  showSource,
  scopeLabel,
  hideEnglish,
  hideChinese,
  canSpeak,
  speakingId,
  onSpeak,
  contextOf,
  onExit,
  paddingBottom
}: FlashDeckProps) {
  /** 第几张；等于 cards.length 时是「过完了」那一屏 */
  const [index, setIndex] = useState(0)
  /** 刚才是往前翻还是往后翻，决定新卡从哪边进来 */
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [drag, setDrag] = useState(0)

  const total = cards.length
  const atEnd = index >= total

  const go = useCallback(
    (step: -1 | 1) => {
      setIndex((i) => Math.max(0, Math.min(total, i + step)))
      setDir(step > 0 ? 'next' : 'prev')
    },
    [total]
  )

  // 卡片少了（编辑模式里删掉了几条）别停在不存在的那一张上
  useEffect(() => {
    if (index > total) setIndex(total)
  }, [index, total])

  /** 键盘：左右箭头翻页，Esc 退出。手机上用不到，浏览器里试的时候顺手 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && t.closest('input, textarea')) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onExit])

  // —— 左右滑：和左滑删除同一套判定，先分清是横滑还是竖着滚卡片 ——
  const start = useRef<{ x: number; y: number } | null>(null)
  const engaged = useRef<boolean | null>(null)
  const dragRef = useRef(0)
  /** 刚滑过，接下来那个 click 要吃掉，免得连带把卡片翻开 */
  const swiped = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    engaged.current = null
    swiped.current = false
    dragRef.current = 0
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!start.current || engaged.current === false) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (engaged.current === null) {
      if (Math.abs(dy) > DIRECTION_SLOP && Math.abs(dy) >= Math.abs(dx)) {
        engaged.current = false
        return
      }
      if (!isHorizontalSwipe(dx, dy)) return
      engaged.current = true
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        /* 捕获不到就算了 */
      }
    }
    swiped.current = true
    const next = dragOffset(dx)
    dragRef.current = next
    setDrag(next)
  }, [])

  const finish = useCallback(() => {
    // 松手时读 ref 不读 state：快划时几个事件挤在同一帧，state 还是上一帧的
    const released = dragRef.current
    start.current = null
    engaged.current = null
    dragRef.current = 0
    setDrag(0)
    const step = swipeDirection(released)
    if (step !== 0) go(step)
  }, [go])

  const onPointerCancel = useCallback(() => {
    start.current = null
    engaged.current = null
    dragRef.current = 0
    setDrag(0)
  }, [])

  const card = atEnd ? null : cards[index]

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-area"
      style={{ paddingBottom }}
    >
      {/* 进度：第几张 / 共几张。就一行字，不画进度条 —— 数字已经说清楚了 */}
      <div className="shrink-0 text-center text-xs text-ink-muted pt-3 tabular-nums">
        {atEnd ? `${total} / ${total}` : `${index + 1} / ${total}`}
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 py-4 max-w-xl w-full mx-auto">
        {card ? (
          <div
            /*
              手指按在卡片上横着滑就换卡。touch-action 留着竖向：卡片高过屏幕时还能上下滚。
              key 跟着 index 走 —— 换卡 = 换一个元素，入场动画重新播一遍，翻开状态也自然归零
            */
            key={index}
            className={`flash-card ${dir === 'next' ? 'flash-in-next' : 'flash-in-prev'}`}
            style={{
              touchAction: 'pan-y',
              transform: drag ? `translateX(${drag}px)` : undefined,
              transition: drag ? 'none' : 'transform 180ms ease-out'
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={onPointerCancel}
            onClickCapture={(e) => {
              if (swiped.current) {
                swiped.current = false
                e.stopPropagation()
                e.preventDefault()
              }
            }}
          >
            <FlashCardView
              card={card}
              showSource={showSource}
              hideEnglish={hideEnglish}
              hideChinese={hideChinese}
              canSpeak={canSpeak}
              speaking={speakingId === card.id}
              onSpeak={() => onSpeak(card)}
              contextOf={contextOf}
            />
          </div>
        ) : (
          <div key="end" className="flash-in-next rounded-2xl border border-stone-200 bg-white shadow-sm p-8 text-center">
            <p className="text-lg font-medium text-ink">过完了</p>
            <p className="mt-2 text-sm text-ink-muted">
              {scopeLabel}的 {total} 张卡都翻过了
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDir('prev')
                  setIndex(0)
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent-100 text-accent-800 hover:bg-accent-200"
              >
                再来一遍
              </button>
              <button
                type="button"
                onClick={onExit}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-muted hover:bg-stone-100"
              >
                回到列表
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 两颗箭头常驻：滑动手感我在这个环境里验不了，箭头是保底的路 */}
      <div className="shrink-0 flex items-center justify-center gap-8 pb-4">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="上一张"
          className="p-3 rounded-full text-ink-muted hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={atEnd}
          aria-label="下一张"
          className="p-3 rounded-full text-ink-muted hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}

function FlashCardView({
  card,
  showSource,
  hideEnglish,
  hideChinese,
  canSpeak,
  speaking,
  onSpeak,
  contextOf
}: {
  card: FlashCard
  showSource: boolean
  hideEnglish: boolean
  hideChinese: boolean
  canSpeak: boolean
  speaking: boolean
  onSpeak: () => void
  contextOf: (anchor: CardAnchor) => ContextSentence | null
}) {
  // 遮住答案时，点一下翻开 / 再点一下盖回去。这一层随 index 重建，换卡自动盖回去
  const [revealed, setRevealed] = useState(false)
  const showEnglish = !hideEnglish || revealed
  const showChinese = !hideChinese || revealed

  const context = card.kind === 'vocab' && card.anchor ? contextOf(card.anchor) : null

  return (
    <div
      className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6 sm:p-8 min-h-[220px] flex flex-col"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('input, textarea, button, select, a')) return
        setRevealed((v) => !v)
      }}
    >
      {card.kind === 'vocab' ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 min-h-[36px]">
              {showEnglish ? (
                <span className="block">
                  <SpeakButton
                    canSpeak={canSpeak}
                    speaking={speaking}
                    onSpeak={onSpeak}
                    label={`朗读 ${card.word}`}
                    className="font-lyric-en font-serif font-bold text-2xl sm:text-3xl text-left leading-tight"
                  >
                    {card.word}
                    {card.auto && <AutoMark />}
                  </SpeakButton>
                </span>
              ) : (
                <span className="text-ink-muted/70 text-sm">点击显示英文</span>
              )}
              {!card.isPhrase && showEnglish && card.phonetic && (
                <span className="text-sm text-ink-muted italic font-mono mt-1 block">{card.phonetic}</span>
              )}
            </div>
            {card.isPhrase
              ? showEnglish && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent-100 text-accent-800 text-xs font-medium">
                    短语
                  </span>
                )
              : card.pos &&
                showEnglish && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-stone-200/80 text-ink text-xs font-medium">
                    {card.pos}
                  </span>
                )}
          </div>

          {(card.definition || hideChinese) && (
            <div className="mt-3 pt-3 border-t border-stone-100 min-h-[32px]">
              {showChinese && card.definition ? (
                <span className="text-base text-ink-muted leading-snug block">{card.definition}</span>
              ) : showChinese ? null : (
                <span className="text-ink-muted/60 text-xs">点击显示释义</span>
              )}
            </div>
          )}
          {card.isPhrase && card.usage && showChinese && (
            <div className="mt-2">
              <span className="text-sm text-stone-500 leading-snug block">{card.usage}</span>
            </div>
          )}

          {/*
            原句：词在句子里高亮。**隐藏英文时连句子一起遮** —— 句子里就写着这个词，露着等于剧透。
            孤儿没有原句，照卡片墙的样子挂「原文已删除」。
          */}
          {showEnglish && (context || card.orphaned) && (
            <div className="mt-4 pt-4 border-t border-stone-100">
              {context ? (
                <p className="font-lyric-en font-serif text-base leading-relaxed text-ink">
                  {context.before}
                  <mark className="bg-accent-100 text-accent-800 rounded px-0.5">{context.hit}</mark>
                  {context.after}
                </p>
              ) : (
                <span
                  className="inline-block px-2 py-0.5 rounded-full bg-stone-100 text-ink-muted text-xs font-medium border border-stone-300/70"
                  title="正文里已经没有这个词了，笔记被保留下来"
                >
                  原文已删除
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="min-h-[36px]">
            {showEnglish ? (
              <p>
                <SpeakButton
                  canSpeak={canSpeak}
                  speaking={speaking}
                  onSpeak={onSpeak}
                  label="朗读这句"
                  className="font-lyric-en font-serif text-lg sm:text-xl leading-relaxed text-left"
                >
                  {card.text}
                  {card.auto && <AutoMark />}
                </SpeakButton>
              </p>
            ) : (
              <span className="text-ink-muted/70 text-sm">点击显示英文</span>
            )}
          </div>
          {/* 句型 / 语法是中文讲解、也是答案，和卡片墙一样：两种遮罩下都遮 */}
          {card.grammar && showEnglish && showChinese && (
            <p className="mt-2 text-sm text-stone-500 font-sans">{card.grammar}</p>
          )}
          {(card.meaning || hideChinese) && (
            <div className="mt-3 pt-3 border-t border-stone-100 min-h-[32px]">
              {showChinese && card.meaning ? (
                <span className="text-base text-ink-muted leading-snug block">{card.meaning}</span>
              ) : showChinese ? null : (
                <span className="text-ink-muted/60 text-xs">点击显示翻译</span>
              )}
            </div>
          )}
        </>
      )}

      {showSource && (
        <p className="mt-auto pt-4 text-xs text-ink-muted/70 truncate">出自 {card.pageTitle}</p>
      )}
    </div>
  )
}
