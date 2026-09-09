import { useCallback, useEffect, useRef, useState } from 'react'
import { AutoMark } from './AutoMark'
import { AutoTextarea } from './AutoTextarea'
import { SpeakButton } from './SpeakButton'
import { DIRECTION_SLOP, isHorizontalSwipe } from './SwipeToDelete'
import { CHROME_STACK } from './chrome'
import type { ContextSentence } from '../utils/contextSentence'
import type { Sentence, WordNote } from '../types'

/**
 * 抽卡：复习页的另一种翻法 —— 一次只看一张，铺满中间，左右滑或拖底下的进度条换卡。
 *
 * 用户 2026-09-09 定的口径：**不是考试**。他不喜欢复习，读法是「读完过一遍，然后读更多，
 * 读得多了自然记住高频的」。所以这里没有「认识 / 不认识」的打分、不记分，
 * 滑到底就是「过完了」。它给的是节奏和终点，卡片墙给不了这两样。
 *
 * 一次只显示一张，所以卡片可以带上**原句**（词在句子里高亮）—— 卡片墙上这样做太高，
 * 一屏放不下几张；这里屏幕本来就只给它一张。
 *
 * 遮罩（隐藏英文 / 中文）和卡片墙同一套开关，点卡片翻开。
 * 翻到第几张由外面记着（`utils/flashPosition.ts`），退出再进来接着翻。
 * 编辑模式下卡上的格子直接能改，和卡片墙同一套字段。
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
  isEditMode: boolean
  onUpdateWord: (word: string, updates: Partial<WordNote> & { grammar?: string }) => void
  onUpdateSentence?: (id: string, updates: Partial<Pick<Sentence, 'grammar' | 'meaning'>>) => void
  canSpeak: boolean
  speakingId: string | null
  onSpeak: (card: FlashCard) => void
  contextOf: (anchor: CardAnchor) => ContextSentence | null
  onExit: () => void
  /** 进来时从第几张开始（上次退出记下的） */
  initialIndex: number
  /** 翻到第几张了，外面拿去记 */
  onIndexChange: (index: number) => void
  /**
   * 沉浸态（顶栏那一套离开了文档流）。
   *
   * 这里只用它做一件事：**让卡片在两种状态下都停在同一个位置**。进沉浸时上面那两条带
   * （加状态栏）走了，这一块往上长一截，居中的卡片就会往下跳半截；退出时又跳回来。
   * 抽卡没有滚动可补偿（阅读页是补 scrollTop），所以用户 2026-09-09 定的办法是：
   * 平时就把卡片放在「收起顶栏后的屏幕中点」—— 比这一块自己的中点靠上一点。
   * 做法是平时给卡片区加一段等于顶栏那一套高度的底边距，中点正好上移那一半；
   * 沉浸时去掉。卡片的位置于是和顶栏在不在无关。
   */
  immersive: boolean
  /**
   * 沉浸态里顶栏这会儿露着（宽屏点空白叫出来的那 3 秒）。
   * 露着的时候卡片区上下**各**垫一段顶栏那么高：中点不变、卡片不动，
   * 但高卡片的上沿会被推到浮着的顶栏底下露出来（用户 2026-09-09 要的「像手机那样」）。
   */
  chromeVisible: boolean
  /**
   * 底部让出导航栏的那段内边距。**要按导航栏本来多高让（--sa-bottom-real），不能按此刻多高** ——
   * 沉浸时导航栏藏起来，此刻的值掉到 0，这一块长高、卡片下沉。缘由见 VocabularyDashboard 传它的地方
   */
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

/**
 * 进度条：手指落在轨道的哪一处，就是第几张。
 * 轨道两端对应第一张和最后一张（不含「过完了」那一屏 —— 那一屏只能滑过最后一张到）。
 */
export function scrubIndex(clientX: number, trackLeft: number, trackWidth: number, total: number): number {
  if (total <= 1 || trackWidth <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (clientX - trackLeft) / trackWidth))
  return Math.round(ratio * (total - 1))
}

/** 圆点该停在轨道的百分之几。过完了那一屏停在最右 */
export function thumbPercent(index: number, total: number): number {
  if (total <= 1) return index >= total ? 100 : 0
  return (Math.min(index, total - 1) / (total - 1)) * 100
}

export function FlashDeck({
  cards,
  showSource,
  scopeLabel,
  hideEnglish,
  hideChinese,
  isEditMode,
  onUpdateWord,
  onUpdateSentence,
  canSpeak,
  speakingId,
  onSpeak,
  contextOf,
  onExit,
  initialIndex,
  onIndexChange,
  immersive,
  chromeVisible,
  paddingBottom
}: FlashDeckProps) {
  /** 第几张；等于 cards.length 时是「过完了」那一屏 */
  const [index, setIndex] = useState(initialIndex)
  /** 刚才是往前翻还是往后翻，决定新卡从哪边进来 */
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [drag, setDrag] = useState(0)

  const total = cards.length
  const atEnd = index >= total

  const jump = useCallback(
    (to: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(total, to))
        if (next !== i) setDir(next > i ? 'next' : 'prev')
        return next
      })
    },
    [total]
  )
  const go = useCallback((step: -1 | 1) => jump(index + step), [jump, index])

  // 卡片少了（编辑模式里删掉了几条）别停在不存在的那一张上
  useEffect(() => {
    if (index > total) setIndex(total)
  }, [index, total])

  // 翻到哪了报给外面记着
  useEffect(() => {
    onIndexChange(index)
  }, [index, onIndexChange])

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
    // 正在改的那一格里横着拖是在挪光标 / 选字，不是要翻页（和左滑删除同一条规矩）
    const field = (e.target as HTMLElement).closest('input, textarea')
    if (field && document.activeElement === field) return
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
      <div
        className="flex-1 flex flex-col justify-center px-4 py-4 max-w-xl w-full mx-auto"
        /*
          平时垫一段底边距 = py-4 自己的 1rem + 状态栏 + 标题栏 44px + 工具带 40px，把卡片抬到「收起顶栏后的屏幕中点」；
          沉浸时那一套不占位置了，垫的也去掉、回到 py-4 的 1rem —— 两种状态下卡片一个像素都不挪。缘由见 immersive 那条 prop。
          ⚠️ 那 1rem 必须算进去：第一版漏了，沉浸时 py-4 还在、平时被行内样式盖掉，量出来差 8px。
          沉浸里顶栏露着那会儿上下各垫同一段：中点还是那个中点，只是高卡片的上沿会落到顶栏底下
        */
        style={
          immersive
            ? chromeVisible
              ? { paddingTop: `calc(1rem + ${CHROME_STACK})`, paddingBottom: `calc(1rem + ${CHROME_STACK})` }
              : undefined
            : { paddingBottom: `calc(1rem + ${CHROME_STACK})` }
        }
      >
        {card ? (
          <div
            /*
              手指按在卡片上横着滑就换卡。touch-action 留着竖向：卡片高过屏幕时还能上下滚。
              key 跟着 index 走 —— 换卡 = 换一个元素，入场动画重新播一遍，翻开状态也自然归零，
              编辑中没落盘的改动由那一层的卸载清理函数兜住
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
              isEditMode={isEditMode}
              onUpdateWord={onUpdateWord}
              onUpdateSentence={onUpdateSentence}
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
                onClick={() => jump(0)}
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

      {/* 进度：第几张 / 共几张，贴在进度条上面（用户 2026-09-09 要的：从顶上挪下来）。沉浸时不收 */}
      <div className="shrink-0 text-center text-xs text-ink-muted tabular-nums">
        {atEnd ? `${total} / ${total}` : `${index + 1} / ${total}`}
      </div>
      <Scrubber total={total} index={index} onJump={jump} />
    </div>
  )
}

/**
 * 底下那条进度条：**播放器那种** —— 一条 2px 的细线，手指按上去圆点才出现、松手就没。
 * 拖或点线上任意一处直接跳到那张，卡片实时跟着换。
 * 用户 2026-09-09 要的：「卡片有那么多，把箭头换成横着的进度条，可以通过滑动快速移动位置」；
 * 第一版常驻一颗 20px 的圆点，他说不好看，三个方向里选了这个。
 *
 * 不用 <input type="range">：各家浏览器的样子不一样、拇指那颗点在安卓上偏小，自己画三个 div 更省事。
 * 整条带子高 44px 好按，线本身只有 2px。**沉浸态下不收**（先收过一版，他改成不收）。
 */
function Scrubber({ total, index, onJump }: { total: number; index: number; onJump: (i: number) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  /** 手指正按着：圆点这会儿才画出来 */
  const [active, setActive] = useState(false)

  const jumpAt = useCallback(
    (clientX: number) => {
      const r = track.current?.getBoundingClientRect()
      if (!r) return
      onJump(scrubIndex(clientX, r.left, r.width, total))
    },
    [onJump, total]
  )

  const pct = thumbPercent(index, total)

  const release = () => {
    dragging.current = false
    setActive(false)
  }

  return (
    <div
      className="shrink-0 px-8 pb-2 select-none"
      /* 整条都归手指：横着拖是在挑卡，不让页面抢去滚 */
      style={{ touchAction: 'none' }}
      role="slider"
      aria-label="翻到第几张"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={Math.min(index + 1, total)}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        dragging.current = true
        setActive(true)
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId)
        } catch {
          /* 捕获不到就算了 */
        }
        jumpAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) jumpAt(e.clientX)
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={track} className="relative h-11 flex items-center">
        <div className="absolute inset-x-0 h-[2px] rounded-full bg-stone-200" />
        <div className="absolute left-0 h-[2px] rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
        {/* 圆点只在按着的时候有：松手就没，平时只剩那条线 */}
        <div
          className={`absolute w-4 h-4 rounded-full bg-accent-500 shadow-sm transition-opacity duration-150 ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>
    </div>
  )
}

function FlashCardView({
  card,
  showSource,
  hideEnglish,
  hideChinese,
  isEditMode,
  onUpdateWord,
  onUpdateSentence,
  canSpeak,
  speaking,
  onSpeak,
  contextOf
}: {
  card: FlashCard
  showSource: boolean
  hideEnglish: boolean
  hideChinese: boolean
  isEditMode: boolean
  onUpdateWord: (word: string, updates: Partial<WordNote> & { grammar?: string }) => void
  onUpdateSentence?: (id: string, updates: Partial<Pick<Sentence, 'grammar' | 'meaning'>>) => void
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

  // —— 编辑模式的几格：本地存着，失焦 / 离开编辑 / 换卡时落盘。和卡片墙上的卡同一套做法 ——
  const [localPos, setLocalPos] = useState(card.kind === 'vocab' ? card.pos ?? '' : '')
  const [localPhonetic, setLocalPhonetic] = useState(card.kind === 'vocab' ? card.phonetic ?? '' : '')
  const [localDefinition, setLocalDefinition] = useState(card.kind === 'vocab' ? card.definition ?? '' : '')
  const [localUsage, setLocalUsage] = useState(card.kind === 'vocab' ? card.usage ?? '' : '')
  const [localGrammar, setLocalGrammar] = useState(card.kind === 'sentence' ? card.grammar ?? '' : '')
  const [localMeaning, setLocalMeaning] = useState(card.kind === 'sentence' ? card.meaning ?? '' : '')

  const handleSave = () => {
    if (card.kind === 'vocab') {
      const nextPos = localPos.trim() || undefined
      const nextPhonetic = localPhonetic.trim() || undefined
      const nextDef = localDefinition.trim() || undefined
      const nextUsage = localUsage.trim() || undefined
      if (card.isPhrase) {
        if (nextDef === card.definition && nextUsage === card.usage) return
        onUpdateWord(card.word, { definition: nextDef, grammar: nextUsage })
        return
      }
      if (nextPos === card.pos && nextPhonetic === card.phonetic && nextDef === card.definition) return
      onUpdateWord(card.word, { pos: nextPos, phonetic: nextPhonetic, definition: nextDef })
      return
    }
    const nextGrammar = localGrammar.trim()
    const nextMeaning = localMeaning.trim()
    if (nextGrammar === (card.grammar ?? '') && nextMeaning === (card.meaning ?? '')) return
    onUpdateSentence?.(card.id, { grammar: nextGrammar, meaning: nextMeaning })
  }

  /**
   * 离开编辑模式、或这张卡被换掉时，把还没提交的改动落下去。
   * 手机上改完直接滑到下一张，输入框往往来不及失焦就被卸掉了 —— 靠这个清理函数兜住。
   */
  const saveRef = useRef(handleSave)
  saveRef.current = handleSave
  useEffect(() => {
    if (!isEditMode) return
    return () => saveRef.current()
  }, [isEditMode])

  return (
    <div
      className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6 sm:p-8 min-h-[220px] flex flex-col"
      data-review-card=""
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
              {card.isPhrase ? null : isEditMode ? (
                <input
                  type="text"
                  className="field-inline text-sm text-ink-muted italic font-mono mt-1"
                  placeholder="音标"
                  aria-label="音标"
                  value={localPhonetic}
                  onChange={(e) => setLocalPhonetic(e.target.value)}
                  onBlur={handleSave}
                />
              ) : showEnglish && card.phonetic ? (
                <span className="text-sm text-ink-muted italic font-mono mt-1 block">{card.phonetic}</span>
              ) : null}
            </div>
            {card.isPhrase ? (
              showEnglish && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent-100 text-accent-800 text-xs font-medium">
                  短语
                </span>
              )
            ) : isEditMode ? (
              <span className="pos-fit shrink-0" data-value={localPos || '词性'}>
                <input
                  type="text"
                  size={1}
                  className="field-pos"
                  placeholder="词性"
                  aria-label="词性"
                  value={localPos}
                  onChange={(e) => setLocalPos(e.target.value)}
                  onBlur={handleSave}
                />
              </span>
            ) : (
              card.pos &&
              showEnglish && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-stone-200/80 text-ink text-xs font-medium">
                  {card.pos}
                </span>
              )
            )}
          </div>

          {(isEditMode || card.definition || hideChinese) && (
            <div className="mt-3 pt-3 border-t border-stone-100 min-h-[32px]">
              {isEditMode ? (
                <AutoTextarea
                  className="field-inline text-base text-ink-muted leading-snug"
                  placeholder="释义 / 备注"
                  aria-label="释义"
                  value={localDefinition}
                  onChange={setLocalDefinition}
                  onBlur={handleSave}
                />
              ) : showChinese && card.definition ? (
                <span className="text-base text-ink-muted leading-snug block">{card.definition}</span>
              ) : showChinese ? null : (
                <span className="text-ink-muted/60 text-xs">点击显示释义</span>
              )}
            </div>
          )}
          {card.isPhrase && (isEditMode || (card.usage && showChinese)) && (
            <div className="mt-2">
              {isEditMode ? (
                <AutoTextarea
                  className="field-inline text-sm text-stone-500 font-sans leading-snug"
                  placeholder="用法 / 搭配"
                  aria-label="短语用法"
                  value={localUsage}
                  onChange={setLocalUsage}
                  onBlur={handleSave}
                />
              ) : (
                <span className="text-sm text-stone-500 leading-snug block">{card.usage}</span>
              )}
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
          {isEditMode ? (
            <>
              <AutoTextarea
                className="field-inline mt-2 text-sm text-stone-500 font-sans"
                placeholder="句型 / 语法"
                aria-label="句型语法"
                value={localGrammar}
                onChange={setLocalGrammar}
                onBlur={handleSave}
              />
              <div className="mt-3 pt-3 border-t border-stone-100 min-h-[32px]">
                <AutoTextarea
                  className="field-inline text-base text-ink-muted leading-snug"
                  placeholder="翻译 / 释义"
                  aria-label="翻译"
                  value={localMeaning}
                  onChange={setLocalMeaning}
                  onBlur={handleSave}
                />
              </div>
            </>
          ) : (
            <>
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
        </>
      )}

      {showSource && (
        <p className="mt-auto pt-4 text-xs text-ink-muted/70 truncate">出自 {card.pageTitle}</p>
      )}
    </div>
  )
}
