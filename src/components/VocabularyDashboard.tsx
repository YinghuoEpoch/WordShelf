import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, FileText, Eye, EyeOff, Sparkles, Layers, LayoutGrid } from 'lucide-react'
import type {
  Annotation,
  LyricPage,
  ReaderSettings,
  Sentence,
  WordNote
} from '../types'
import { annotationToSentence } from '../utils/annotationViews'
import { sortByText } from '../utils/annotationOrder'
import { AutoMark } from './AutoMark'
import { BAND_SUB, CHROME_STACK } from './chrome'
import { readerThemeStyles } from './theme'
import { isOnShelf } from '../utils/shelf'
import { EditedMark } from './EditedMark'
import { AutoTextarea } from './AutoTextarea'
import { getFolderReviewData, getPageReviewData } from '../hooks/getFolderReviewData'
import { useSpeak } from '../hooks/useSpeak'
import { SpeechNotice } from './SpeechNotice'
import { usePrefetchAudio } from '../hooks/usePrefetchAudio'
import { useBackHandler, BackPriority } from '../hooks/useBackHandler'
import { SwipeToDelete } from './SwipeToDelete'
import { SpeakButton } from './SpeakButton'
import { FlashDeck, type CardAnchor, type FlashCard } from './FlashDeck'
import { contextSentence } from '../utils/contextSentence'
import { deckKey, loadFlashPosition, saveFlashPosition } from '../utils/flashPosition'
import { buildWordList, type WordRef } from '../utils/reconcile'

export type ReviewTarget =
  | { type: 'page'; id: string }
  | { type: 'book'; id: string }
  | null

interface VocabCardItem {
  /** 单词还是短语。短语的卡片不显示音标/词性，改显示「用法」 */
  kind: 'word' | 'phrase'
  /**
   * 卡片的键。单篇和文库复习里都是「文档+拼写」拼出来的合并键 ——
   * 卡是按拼写合并出来的，不对应某一条标注。要删的话看 ids。
   */
  id: string
  /**
   * 这张卡底下压着的标注。单篇复习里滑掉一张卡就是删掉它们全部；文库复习不给删
   * （能不能删由 swipable 那条判，和这一格有没有值无关）。抽卡拿第一条去正文里找原句。
   */
  ids?: string[]
  pageId: string
  pageTitle: string
  word: string
  phonetic?: string
  pos?: string
  definition?: string
  /** 短语的用法 / 搭配说明。存在标注的 grammar 字段里 */
  usage?: string
  /** 原文已删除：正文里已经没有这个词了，但笔记被保留下来 */
  orphaned?: boolean
  /** 短语才会有：正文改过、它跟着变短或错位了，这里是当初划的那一段 */
  sourceText?: string
  /** 由 AI 自动填充，需要复核 */
  auto?: boolean
  /** 这张卡合并了几条标注。文库复习跨篇数，单篇复习数这一篇里划了几次。卡上不显示，只用来分组 */
  frequency?: number
}

export interface VocabularyDashboardProps {
  reviewTarget: ReviewTarget
  books: { id: string; name: string }[]
  pages: LyricPage[]
  /** 标注表（全部）。组件自己按当前复习范围筛 */
  annotations: Annotation[]
  isEditMode: boolean
  onUpdateWord: (word: string, updates: Partial<WordNote> & { grammar?: string }) => void
  /** 复习模式下编辑句摘（句型/翻译） */
  onUpdateSentence?: (id: string, updates: Partial<Pick<Sentence, 'grammar' | 'meaning'>>) => void
  onVocabCountChange?: (count: number) => void
  /**
   * 删掉一张卡底下的全部笔记（左滑划到位之后确认那一下）。
   *
   * **只在单篇文档的复习里**。单篇里同一个词划了几次会合并成一张卡，
   * 滑掉它就是这篇里的几处一起删，确认框会写明几处。
   * 文库复习不给：那边一张卡横跨几篇，删了看不见删的是哪几处。
   */
  onDeleteAnnotations?: (ids: string[]) => void
  /** 打开「一键填充」对话框；范围就是当前复习的文档或文库 */
  onOpenAutoFill?: () => void
  /** 填充弹窗是否开着：开着时这颗按钮保持「按下」的样子（仅限没有空白卡片那一档）*/
  autoFillOpen?: boolean
  /** 当前范围内还有多少条空白笔记；为 0 时不显示填充按钮（没什么可填的） */
  autoFillCount?: number
  /** 阅读设置。这里只用 `theme` —— 底色要和阅读页同一个 */
  readerSettings?: ReaderSettings
  /**
   * 沉浸（第一百节，用户 2026-09-09 要的：「复习模式也能像阅读模式那样收起顶栏」）。
   * 进不进由 App 算（shouldImmerse，和阅读页同一套规则）；这里只管自己那条工具带
   * 改成浮在上面、跟着顶栏一起出没，做法照抄 LyricEditor 那条带。抽卡的进度条也跟着收。
   */
  immersive?: boolean
  /** 沉浸态下这会儿顶栏露没露出来 */
  chromeVisible?: boolean
  [key: string]: any
}

function VocabularyDashboardInner({
  reviewTarget,
  pages,
  annotations,
  isEditMode,
  onUpdateWord,
  onUpdateSentence,
  onVocabCountChange,
  onOpenAutoFill,
  autoFillOpen = false,
  autoFillCount = 0,
  onDeleteAnnotations,
  readerSettings = { fontSize: 18, fontFamily: 'sans', theme: 'pure', accent: 'amber' },
  immersive = false,
  chromeVisible = false
}: VocabularyDashboardProps) {
  /** 顶栏那一套此刻收着：工具带跟着收 */
  const chromeHidden = immersive && !chromeVisible
  /**
   * 沉浸里顶栏露着（宽屏点空白叫出来的那 3 秒）：卡片墙的开头垫一段顶栏那么高，
   * 滚到顶时第一排卡在浮着的顶栏底下露出来（第一百零三节，用户要的「像手机那样」）。
   * 只在露着时垫，收了就撤 —— 他在两个方案里选的这个。窄屏沉浸里顶栏从不露，这一格恒为 false
   */
  const chromePad = immersive && chromeVisible

  /**
   * 顶栏进出、垫子加减时卡片墙在屏幕上不动 —— 照抄 LyricEditor 那一段（第八十二节，他选的 B）。
   * 进沉浸时上面两条带离开文档流，这个滚动容器的上沿往上挪一截，里面的卡整块跟着往上顶；
   * 上沿挪了多少、上内边距变了多少，**加在一起** scrollTop 反向补多少 —— 两样常常同一趟发生
   * （宽屏进沉浸时顶栏先露着：上沿 -C、垫子 +C，合起来是 0），分开补会在文首附近被 0 夹住一次。
   * 滚到文首附近补不到负数，那一下会动，无妨（顶栏自动收掉时正是这种，他接受）。
   * 读「以前在哪」只能靠上一次提交记下的值，所以下面那个无依赖的 effect **必须排在后面**。
   * 抽卡那边没有滚动，走的是另一条路（FlashDeck 的 immersive / chromeVisible）。
   */
  const wallRef = useRef<HTMLDivElement>(null)
  const wallTopRef = useRef<number | null>(null)
  const wallPadRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = wallRef.current
    if (!el) return
    const padNow = parseFloat(getComputedStyle(el).paddingTop) || 0
    const padPrev = wallPadRef.current
    wallPadRef.current = padNow
    const prev = wallTopRef.current
    if (prev === null || padPrev === null) return
    // 宽窄一样，缘由见 LyricEditor 同一处（第一百零五节：中间试过「宽屏不补」被否，文首那一下的跳是 0 夹出来的，正是他要的）
    const delta = el.getBoundingClientRect().top - prev + (padNow - padPrev)
    if (Math.abs(delta) > 0.5) el.scrollTop += delta
  }, [immersive, chromePad])
  useLayoutEffect(() => {
    wallTopRef.current = wallRef.current?.getBoundingClientRect().top ?? null
  })
  const themeStyles = readerThemeStyles(readerSettings.theme)
  const [hideEnglish, setHideEnglish] = useState(false)
  const [hideChinese, setHideChinese] = useState(false)
  const [reviewMode, setReviewMode] = useState<'vocab' | 'sentence'>('vocab')
  /**
   * 抽卡：一次只看一张（用户 2026-09-09 要的，见 FlashDeck）。
   * **什么都不退**：切词/句、换一篇 / 换文库、进编辑模式，都留在抽卡里（第二、三、四版各去掉一条，全是他报的）。
   * 换成另一叠就从那一叠记下的位置接着翻（FlashDeck 按 flashKey 重建）。
   * 只有自己按那颗图标、「过完了」那屏的「回到列表」、安卓返回键才出去。
   * 换到一个没卡的范围时卡片墙的空态顶上来，开关还开着，再换到有卡的又是抽卡。
   */
  const [flashcards, setFlashcards] = useState(false)
  /** 左滑露出删除的那张卡。同时只开一张，不然满屏都是红按钮 */
  /**
   * 划到位之后要问的那一条。
   *
   * 从前这里存的是「哪张卡滑开着」—— 现在没有滑开这回事了，
   * 划到位就直接弹确认框，所以存的是「正在问哪一条」。
   */
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; label: string } | null>(null)

  /**
   * 点词 / 点句读出来。这台手机不支持朗读时 canSpeak 为 false，喇叭就不画。
   * 必须放在所有提前 return 之前 —— 钩子数量一旦忽多忽少，React 直接报错白屏。
   */
  const { canSpeak, speakingId, speak, error: speechError, installVoice, dismissError } = useSpeak()

  const getPageTitle = (pageId: string) =>
    pages.find((p) => p.id === pageId)?.title || '未命名'

  const getGroupedVocab = (): { title: string; pageId: string; items: VocabCardItem[] }[] => {
    if (!reviewTarget) return []
    if (reviewTarget.type === 'page') {
      /*
        单篇复习：同一篇里划了不止一次的词合并成一张卡、单列一组放在最上面
        （用户 2026-09-08 提的：文库那个汇总重复生词的功能，文档也要）。
        **没有重复的文档和从前一模一样** —— 只有一组、标题还是文档名、次序还是正文顺序。
      */
      const { high, normal } = getPageReviewData(reviewTarget.id, pages, annotations)
      const toCard = (i: (typeof high)[number]): VocabCardItem => ({
        kind: i.kind,
        pageId: i.pageId,
        pageTitle: i.pageTitle,
        id: i.id,
        ids: i.ids,
        word: i.word,
        phonetic: i.phonetic,
        pos: i.pos,
        definition: i.definition,
        usage: i.usage,
        sourceText: i.sourceText,
        orphaned: i.orphaned,
        auto: i.auto,
        frequency: i.frequency
      })
      const sections: { title: string; pageId: string; items: VocabCardItem[] }[] = []
      if (high.length > 0) {
        sections.push({ title: '高频 / 重点生词', pageId: `${reviewTarget.id}-high`, items: high.map(toCard) })
      }
      if (normal.length > 0) {
        sections.push({ title: getPageTitle(reviewTarget.id), pageId: reviewTarget.id, items: normal.map(toCard) })
      }
      return sections
    }

    /*
      文库级别复习：按拼写合并，**按在几篇里划过分组**，篇数多的在前（用户 2026-09-09 要的）。
      他的读法是「读完过一遍，读得多了自然会记住高频的东西」—— 一个词在越多篇里被划过，
      越是那个自然筛选筛出来的。组名就写篇数，卡上照旧什么记号都不加。
    */
    return getFolderReviewData(reviewTarget.id, pages, annotations).map((g) => ({
      title: g.docCount > 1 ? `在 ${g.docCount} 篇里划过` : '只在 1 篇里划过',
      pageId: `${reviewTarget.id}-docs-${g.docCount}`,
      items: g.items.map((i) => ({
        kind: i.kind,
        pageId: i.pageId,
        pageTitle: i.pageTitle,
        id: i.id,
        ids: i.ids,
        word: i.word,
        phonetic: i.phonetic,
        pos: i.pos,
        definition: i.definition,
        usage: i.usage,
        orphaned: i.orphaned,
        auto: i.auto,
        frequency: i.frequency
      }))
    }))
  }

  type SentenceSection = { title: string; pageId: string; items: Sentence[] }

  const getGroupedSentences = (): SentenceSection[] => {
    if (!reviewTarget) return []
    const sentences = sortByText(annotations.filter((a) => a.type === 'sentence')).map(
      annotationToSentence
    )
    if (!sentences.length) return []

    if (reviewTarget.type === 'page') {
      const items = sentences.filter((s) => s.docId === reviewTarget.id)
      if (items.length === 0) return []
      return [{ title: getPageTitle(reviewTarget.id), pageId: reviewTarget.id, items }]
    }
    // 文库：该 book 下所有页面的句摘，按文档分组
    const pagesInBook = pages.filter((p) => p.bookId === reviewTarget.id && isOnShelf(p))
    const pageIds = new Set(pagesInBook.map((p) => p.id))
    const filtered = sentences.filter((s) => pageIds.has(s.docId))
    if (filtered.length === 0) return []
    const byPage = new Map<string, Sentence[]>()
    for (const s of filtered) {
      const list = byPage.get(s.docId) ?? []
      list.push(s)
      byPage.set(s.docId, list)
    }
    return pagesInBook
      .filter((p) => (byPage.get(p.id)?.length ?? 0) > 0)
      .map((p) => ({
        title: getPageTitle(p.id),
        pageId: p.id,
        items: byPage.get(p.id)!
      }))
  }

  /**
   * 能不能左滑删除。
   *
   * **编辑模式内外都给。** 一开始只在编辑模式里，结果真机上很难划出来 ——
   * 那时候卡片正中间整条带子是输入框。挡输入框那条后来收窄了，
   * 但**非编辑模式下压根没有输入框**，那边天生就顺手，没有理由不给。
   *
   * 「文库复习不给」这条**保留**：那边一张卡是按拼写把好几条标注合并出来的，
   * 删它等于一次删好几条，而且看不见删了哪几条。
   */
  const swipable = reviewTarget?.type === 'page' && !!onDeleteAnnotations

  const grouped = getGroupedVocab()
  const groupedSentences = getGroupedSentences()
  const totalCards = grouped.reduce((sum, g) => sum + g.items.length, 0)
  const totalSentenceCards = groupedSentences.reduce((sum, g) => sum + g.items.length, 0)
  const displayCount = reviewMode === 'vocab' ? totalCards : totalSentenceCards

  useEffect(() => {
    onVocabCountChange?.(reviewMode === 'vocab' ? totalCards : totalSentenceCards)
  }, [totalCards, totalSentenceCards, reviewMode, onVocabCountChange])

  // 退出编辑模式、换一篇、切到句摘那边：还开着的确认框收掉。
  // 卡片已经换了一批，再点「删除」删的就不是当初划的那一条了
  useEffect(() => {
    setPendingDelete(null)
  }, [isEditMode, reviewTarget?.id, reviewMode])

  /**
   * 这一页的发音先悄悄备好，省掉每个词第一次点时等开口的那半秒。
   * 和上面那个 useEffect 一样，必须待在提前 return 之前。
   */
  usePrefetchAudio(
    grouped.flatMap((g) => g.items.map((i) => i.word)),
    canSpeak && reviewMode === 'vocab'
  )

  // 安卓返回键先关这个框。和左侧栏的「彻底删除」同一档 —— 问的是同一件事
  useBackHandler(!!pendingDelete, BackPriority.confirmDelete, () => setPendingDelete(null))
  // 安卓返回键：抽卡开着就先退回卡片墙
  useBackHandler(flashcards, BackPriority.flashcards, () => setFlashcards(false))

  /**
   * 抽卡上的原句：按文档缓存分好的词表，正文没改就不重算。
   * 一篇长文的词表要几十毫秒，一叠两百张卡不能每张算一遍。
   */
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages])
  const annotationById = useMemo(() => new Map(annotations.map((a) => [a.id, a])), [annotations])
  const wordLists = useRef(new Map<string, { updatedAt: number; words: WordRef[] }>())
  const contextOf = useCallback(
    (anchor: CardAnchor) => {
      const page = pageById.get(anchor.docId)
      if (!page) return null
      let entry = wordLists.current.get(page.id)
      if (!entry || entry.updatedAt !== page.updatedAt) {
        entry = { updatedAt: page.updatedAt, words: buildWordList(page.content) }
        wordLists.current.set(page.id, entry)
      }
      return contextSentence(page.content, entry.words, anchor.start, anchor.end)
    },
    [pageById]
  )
  const anchorOf = (item: VocabCardItem): CardAnchor | null => {
    const a = annotationById.get(item.ids?.[0] ?? '')
    if (!a) return null
    return { docId: a.docId, start: a.start, end: a.end }
  }
  /** 抽卡的那一叠：和卡片墙同一批、同一个次序，只是摊平 */
  const deck: FlashCard[] =
    reviewMode === 'vocab'
      ? grouped.flatMap((g) =>
          g.items.map((i) => ({
            kind: 'vocab' as const,
            id: i.id,
            word: i.word,
            isPhrase: i.kind === 'phrase',
            phonetic: i.phonetic,
            pos: i.pos,
            definition: i.definition,
            usage: i.usage,
            auto: i.auto,
            orphaned: i.orphaned,
            pageTitle: i.pageTitle,
            anchor: i.orphaned ? null : anchorOf(i)
          }))
        )
      : groupedSentences.flatMap((g) =>
          g.items.map((i) => ({
            kind: 'sentence' as const,
            id: i.id,
            text: i.text,
            grammar: i.grammar,
            meaning: i.meaning,
            auto: i.auto,
            orphaned: i.orphaned,
            pageTitle: g.title
          }))
        )
  /** 翻到第几张记在本机（utils/flashPosition.ts），退出再进来接着翻 */
  const flashKey = reviewTarget ? deckKey(reviewTarget, reviewMode) : ''
  const deckLength = deck.length
  const rememberFlashIndex = useCallback(
    (i: number) => saveFlashPosition(flashKey, i, deckLength),
    [flashKey, deckLength]
  )

  if (!reviewTarget) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center text-ink-muted ${themeStyles.bg}`}>
        <BookOpen className="w-12 h-12 mb-4 opacity-40" />
        <p className="text-sm text-center px-4">在左侧选择文档或文库以查看生词</p>
      </div>
    )
  }

  return (
    <div className={`relative flex-1 flex flex-col min-h-0 overflow-hidden ${themeStyles.bg}`}>
      {/*
        背诵遮罩开关 + 词/句切换。
        沉浸态里这条带浮在卡片上面、不占位置，跟着顶栏一起出没 —— `top` 是状态栏那一截加标题栏 44px，
        缘由和 LyricEditor 那条带同一份。`data-review-chrome`：点在带子的空处不算点空白
      */}
      <div
        className={`${BAND_SUB} flex-wrap ${
          immersive
            ? `absolute inset-x-0 top-[calc(var(--sa-top-real)+2.75rem)] z-20 bg-white transition-opacity duration-200 ${
                chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`
            : 'bg-white/80'
        }`}
        aria-hidden={chromeHidden}
        data-review-chrome=""
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* 图标 + 单字，比「隐藏英文」四个字省一半宽度，四种遮罩状态都还在 */}
          <button
            type="button"
            onClick={() => setHideEnglish((v) => !v)}
            title={hideEnglish ? '显示英文' : '隐藏英文'}
            /*
              **这一行一个实心块都不留。**
              带只有 40px，塞一个 32px 的实心块进去上下就各剩 4px —— 竖着看很堵，
              而且不分开着关着：底色一填就堵。所以状态不再靠「填一块底色」表达。

              开着 = 琥珀色的字 + 图标从「睁眼」换成「闭眼」，两个信号叠在一起，
              比一块底色更好认，还不占竖向空间。
              （和两个侧栏拆掉「盒中盒」是同一件事，这一行是最后一处。）
            */
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100 ${
              hideEnglish ? 'text-accent-700' : 'text-ink-muted'
            }`}
          >
            {hideEnglish ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            英
          </button>
          <button
            type="button"
            onClick={() => setHideChinese((v) => !v)}
            title={hideChinese ? '显示中文' : '隐藏中文'}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100 ${
              hideChinese ? 'text-accent-700' : 'text-ink-muted'
            }`}
          >
            {hideChinese ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            中
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* 常驻按钮。数的是「还有格子空着」的笔记，单词和句子一起算。
              全填完了也留着 —— 一来位置固定，不会今天在明天不在；
              二来「AI 设置」只有这条路进得去，从前全填完就再也改不了 Key 了。
              没得可填时收成一枚安静的图标，与旁边的「词/句」同一等级，
              有得可填才亮成实心并报数。 */}
          {onOpenAutoFill && (
            <button
              type="button"
              onClick={onOpenAutoFill}
              /*
                **整块琥珀底去掉了。** 它是这一行里最重的一块 —— 30px 的实心块塞在
                40px 的带里上下各剩 5px，用户说的「显挤」主要就是它。

                「还差几条没填全」改成**琥珀色的字 + 后面直接跟个数字**。
                中间试过把数字装进一枚小圆点，用户说不用 —— 直接挂着就行，
                少一层东西也少一处要对齐的地方。

                按下去的反馈和「弹窗开着一直亮」都还在，只是都改成文字变色，
                不再靠填底色（`hover:` 这个变体已经被改成「悬停 **或** 正按着」，
                见 tailwind.config.js）。
              */
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-colors hover:bg-stone-100 hover:text-accent-700 ${
                autoFillCount > 0 || autoFillOpen ? 'text-accent-700' : 'text-ink-muted'
              }`}
              title={
                autoFillCount > 0
                  ? `还有 ${autoFillCount} 条笔记没填全，让 AI 只补空着的格子`
                  : '笔记都填全了；点开可以改 AI 设置'
              }
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              {/*
                写「AI 填充」不写「填充」：和生词板那颗「AI 划词」凑成一对，
                两个 AI 功能一眼看得出是同一类。（划词那颗见第二十二节 ——
                它从前是个没有文字的图标，手机上等于哑谜。）
                量过：375px 窄屏上这一排左右两组之间空着 123px，
                多出来的「AI 」只占 17px，带上数字最坏也只多 39px，不会挤到第二行。
              */}
              AI 填充{autoFillCount > 0 ? ` ${autoFillCount}` : ''}
            </button>
          )}
          {/*
            抽卡 / 列表：同一颗键来回切，**只有图标、不带字、不标状态**。
            第一版带「抽卡 / 列表」两个字、开着时字变强调色 —— 用户真机：这一栏太挤，
            而且「我只需要点击的时候有反馈就行」。切没切进抽卡，屏幕本身已经说明了。
          */}
          {displayCount > 0 && (
            <button
              type="button"
              onClick={() => setFlashcards((v) => !v)}
              title={flashcards ? '回到卡片列表' : '一次只看一张'}
              aria-label={flashcards ? '回到卡片列表' : '抽卡'}
              className="p-1.5 rounded-lg text-ink-muted transition-colors hover:bg-stone-100"
            >
              {flashcards ? <LayoutGrid className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReviewMode((v) => (v === 'vocab' ? 'sentence' : 'vocab'))}
            /* 从前带着 focus:bg-stone-100 —— 手机上点完焦点留在键上，灰底就赖着不走（用户 2026-09-09 报的）。
               现在只剩按下那一瞬的反馈（hover: 在触屏上就是正按着） */
            className="px-2 py-1 rounded-lg text-sm font-medium text-ink-muted hover:bg-stone-100 transition-colors"
          >
            {reviewMode === 'vocab' ? '词' : '句'}
          </button>
        </div>
      </div>

      {/* 这一条从前只在这儿画，现在三处共用同一个（阅读页、生词板也要说话） */}
      <SpeechNotice error={speechError} onInstall={installVoice} onDismiss={dismissError} />

      {/*
        底部让出导航栏：加在滚动区自己的内边距里（p-6 是 1.5rem），
        底色才铺得到屏幕最下沿 —— 理由同 LyricEditor 那处
      */}
      {flashcards && displayCount > 0 ? (
        <FlashDeck
          /* 换一叠（另一篇 / 词↔句）就重建，起点从记下来的位置读 */
          key={flashKey}
          cards={deck}
          showSource={reviewTarget.type === 'book'}
          scopeLabel={reviewTarget.type === 'book' ? '这个文库' : '这一篇'}
          hideEnglish={hideEnglish}
          hideChinese={hideChinese}
          isEditMode={isEditMode}
          onUpdateWord={onUpdateWord}
          onUpdateSentence={onUpdateSentence}
          initialIndex={loadFlashPosition(flashKey, deck.length)}
          onIndexChange={rememberFlashIndex}
          immersive={immersive}
          chromeVisible={chromeVisible}
          canSpeak={canSpeak}
          speakingId={speakingId}
          onSpeak={(c) => (c.kind === 'vocab' ? speak(c.id, c.word, { lookup: true }) : speak(c.id, c.text))}
          contextOf={contextOf}
          onExit={() => setFlashcards(false)}
          /*
            按导航栏**本来**多高让，不按此刻多高（--sa-bottom）。沉浸时导航栏藏起来 --sa-bottom 掉到 0，
            底下这条让出来的收回去，居中的卡片就往下沉半截 —— 平板三键导航 48px，沉 24px，他看出来了。
            按本来多高让，这一块的高度就和导航栏在不在、原生什么时候报上来都无关；代价是沉浸时最底下
            留着导航栏那么高的一条空白，卡片不动比那条空白值钱
          */
          paddingBottom="calc(1rem + var(--sa-bottom-real))"
        />
      ) : (
      <div
        ref={wallRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-area p-6"
        style={{
          paddingBottom: 'calc(1.5rem + var(--sa-bottom))',
          paddingTop: chromePad ? `calc(1.5rem + ${CHROME_STACK})` : undefined
        }}
      >
        {displayCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-ink-muted">
            <FileText className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">
              {reviewMode === 'vocab' ? '当前没有生词，先去阅读并标记单词吧' : '当前没有句摘，先去阅读并保存句子吧'}
            </p>
          </div>
        ) : reviewMode === 'vocab' ? (
          <div className="space-y-8 max-w-5xl mx-auto">
            {grouped.map((group) => (
              <section key={group.pageId}>
                <h2 className="text-sm font-medium text-ink-muted mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {group.title}
                  <span className="text-xs font-normal text-gray-400">({group.items.length})</span>
                </h2>
                <div className={GRID_CLASS}>
                  {group.items.map((item) => (
                    <MaybeSwipe
                      key={item.id}
                      swipable={swipable}
                      onRequestDelete={() => {
                        const ids = item.ids ?? [item.id]
                        setPendingDelete({
                          ids,
                          // 合并卡说清楚是几处，用户才知道这一下删的不止一条
                          label: ids.length > 1 ? `「${item.word}」在这篇里的 ${ids.length} 处笔记` : `「${item.word}」这条笔记`
                        })
                      }}
                    >
                      <VocabCard
                        item={item}
                        hideEnglish={hideEnglish}
                        hideChinese={hideChinese}
                        isEditMode={isEditMode}
                        onUpdateWord={onUpdateWord}
                        canSpeak={canSpeak}
                        speaking={speakingId === item.id}
                        onSpeak={() => speak(item.id, item.word, { lookup: true })}
                      />
                    </MaybeSwipe>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-8 max-w-5xl mx-auto">
            {groupedSentences.map((group) => (
              <section key={group.pageId}>
                <h2 className="text-sm font-medium text-ink-muted mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {group.title}
                  <span className="text-xs font-normal text-gray-400">({group.items.length})</span>
                </h2>
                <div className={GRID_CLASS}>
                  {group.items.map((item) => (
                    <MaybeSwipe
                      key={item.id}
                      swipable={swipable}
                      onRequestDelete={() => setPendingDelete({ ids: [item.id], label: '这条句摘' })}
                    >
                      <SentenceCard
                        item={item}
                        hideEnglish={hideEnglish}
                        hideChinese={hideChinese}
                        isEditMode={isEditMode}
                        onUpdateSentence={onUpdateSentence}
                        canSpeak={canSpeak}
                        speaking={speakingId === item.id}
                        onSpeak={() => speak(item.id, item.text)}
                      />
                    </MaybeSwipe>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      )}

      {/*
        划到位之后问这一句。挂到 body 上，否则遮罩只盖得住看板这一块。
        样子和左侧栏那个「彻底删除」保持一致 —— 问的是同一件事：删了就找不回来。
        点框外面能关（第四十节定的规矩）。
      */}
      {pendingDelete && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 kb-safe"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border border-paper-border p-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm leading-relaxed text-ink mb-4">
              确定要删除{pendingDelete.label}吗？此操作不可恢复。
            </p>
            {/* 用户拍板：删除在左、取消在右 */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onDeleteAnnotations?.(pendingDelete.ids)
                  setPendingDelete(null)
                }}
                className="px-3 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700"
              >
                删除
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 py-2 rounded-lg text-sm text-ink-muted hover:bg-stone-100"
              >
                取消
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'

/**
 * 可滑就套一层，不可滑就原样放行。
 *
 * 不做成「一直套着、靠 props 关掉」—— 那样非编辑模式下每张卡都白白多两层 div
 * 和一串指针事件监听，一页上百张卡不划算。
 */
function MaybeSwipe({
  swipable,
  onRequestDelete,
  children
}: {
  swipable: boolean
  onRequestDelete: () => void
  children: React.ReactNode
}) {
  if (!swipable) return <>{children}</>
  return <SwipeToDelete onRequestDelete={onRequestDelete}>{children}</SwipeToDelete>
}


function VocabCard({
  item,
  hideEnglish,
  hideChinese,
  isEditMode,
  onUpdateWord,
  canSpeak,
  speaking,
  onSpeak
}: {
  item: VocabCardItem
  hideEnglish: boolean
  hideChinese: boolean
  isEditMode: boolean
  onUpdateWord: (word: string, updates: Partial<WordNote> & { grammar?: string }) => void
  canSpeak: boolean
  speaking: boolean
  onSpeak: () => void
}) {
  // 遮住答案时，点一下卡片翻开 / 再点一下盖回去（触摸屏没有 hover，只能靠点）
  const [revealed, setRevealed] = useState(false)
  const showEnglish = !hideEnglish || revealed
  const showChinese = !hideChinese || revealed
  const isPhrase = item.kind === 'phrase'
  const [localPos, setLocalPos] = useState(item.pos ?? '')
  const [localPhonetic, setLocalPhonetic] = useState(item.phonetic ?? '')
  const [localDefinition, setLocalDefinition] = useState(item.definition ?? '')
  const [localUsage, setLocalUsage] = useState(item.usage ?? '')

  useEffect(() => {
    setLocalPos(item.pos ?? '')
    setLocalPhonetic(item.phonetic ?? '')
    setLocalDefinition(item.definition ?? '')
    setLocalUsage(item.usage ?? '')
  }, [item.word, item.pos, item.phonetic, item.definition, item.usage])

  const handleSave = () => {
    const nextPos = localPos.trim() || undefined
    const nextPhonetic = localPhonetic.trim() || undefined
    const nextDef = localDefinition.trim() || undefined
    const nextUsage = localUsage.trim() || undefined

    // 短语没有音标和词性那两格，别把它们连带写成空
    if (isPhrase) {
      if (nextDef === item.definition && nextUsage === item.usage) return
      onUpdateWord(item.word, { definition: nextDef, grammar: nextUsage })
      return
    }

    if (nextPos === item.pos && nextPhonetic === item.phonetic && nextDef === item.definition) return

    onUpdateWord(item.word, {
      pos: nextPos,
      phonetic: nextPhonetic,
      definition: nextDef
    })
  }

  /**
   * 离开编辑模式（或卡片被卸掉）时，把还没提交的改动落下去。
   *
   * 从前**只有 onBlur 一个触发点**。手机上改完直接点铅笔退出时，
   * 输入框往往还没来得及失焦就被换掉了，那次改动就这么悄悄没了 ——
   * 数据没存，AI 角标自然也不会消失。
   * 这里用「进编辑模式时登记、离开时执行」的清理函数兜住，
   * 不管失焦事件来不来都保得住。
   */
  const saveRef = useRef(handleSave)
  saveRef.current = handleSave
  useEffect(() => {
    if (!isEditMode) return
    return () => saveRef.current()
  }, [isEditMode])

  /*
    划过不止一次的卡**不做任何记号**（用户 2026-09-08 定的）。
    试过数字角标（碍事）、强调色边框（廉价）、强调色阴影、极淡的强调色底，最后他说
    「什么都不加比较好」—— 高频卡本来就单独列在「高频 / 重点生词」那一组里，
    分组标题已经把话说完了，卡上再标是重复。
  */
  return (
    <div
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-all min-h-[100px]"
      data-review-card=""
      onClick={(e) => {
        // 点在输入框 / 按钮上时不要连带翻开答案
        if ((e.target as HTMLElement).closest('input, textarea, button, select, a')) return
        setRevealed((v) => !v)
      }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1 min-h-[28px]">
          {showEnglish ? (
            /* 点单词 = 读出来；卡片别处照旧是「翻开答案」。
               外层那个 onClick 本来就跳过 button，两件事不会打架 */
            <span className="block">
              <SpeakButton
                canSpeak={canSpeak}
                speaking={speaking}
                onSpeak={onSpeak}
                label={`朗读 ${item.word}`}
                className="font-lyric-en font-serif font-bold text-lg text-left"
              >
                {item.word}
                {item.auto && <AutoMark />}
              </SpeakButton>
            </span>
          ) : (
            <span className="text-ink-muted/70 text-sm">
              点击显示英文
            </span>
          )}
          {item.orphaned && (
            <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full bg-stone-100 text-ink-muted text-xs font-medium border border-stone-300/70"
              title="正文里已经没有这个词了，笔记被保留下来"
            >
              原文已删除
            </span>
          )}
          {/* 只有短语会「变短」—— 单词标注就一个词，要么在要么没了 */}
          {item.sourceText && !item.orphaned && showEnglish && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <EditedMark sourceText={item.sourceText} expanded={revealed || !hideEnglish} />
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isPhrase ? (
            showEnglish && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent-100 text-accent-800 text-xs font-medium">
                短语
              </span>
            )
          ) : isEditMode ? (
            /* 保持阅读态那颗药丸的样子，宽度跟着内容走 */
            <span className="pos-fit shrink-0" data-value={localPos || '词性'}>
              <input
                type="text"
                /* size=1 是关键：不设的话输入框自带约 180px 的固有宽度，
                   会把外层网格整个撑开，药丸就不再跟着内容收缩了 */
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
            item.pos &&
            showEnglish && (
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-stone-200/80 text-ink text-xs font-medium">
                {item.pos}
              </span>
            )
          )}
        </div>
      </div>
      {isPhrase ? null : isEditMode ? (
        /* 类名和下面阅读态那一行保持一致，两种模式看起来才是同一行字 */
        <input
          type="text"
          className="field-inline text-sm text-ink-muted italic font-mono mt-1"
          placeholder="音标"
          aria-label="音标"
          value={localPhonetic}
          onChange={(e) => setLocalPhonetic(e.target.value)}
          onBlur={handleSave}
        />
      ) : showEnglish && item.phonetic ? (
        <span className="text-sm text-ink-muted italic font-mono mt-1 block">
          {item.phonetic}
        </span>
      ) : null}
      {(isEditMode || item.definition) && (
        <div className="mt-2 pt-2 border-t border-stone-100 min-h-[32px]">
          {isEditMode ? (
            <AutoTextarea
              className="field-inline text-sm text-ink-muted leading-snug"
              placeholder="释义 / 备注"
              aria-label="释义"
              value={localDefinition}
              onChange={setLocalDefinition}
              onBlur={handleSave}
            />
          ) : showChinese ? (
            <span className="text-sm text-ink-muted leading-snug block">
              {item.definition}
            </span>
          ) : (
            <span className="text-ink-muted/60 text-xs">
              点击显示释义
            </span>
          )}
        </div>
      )}
      {/* 短语专有的第二格：用法 / 搭配。单词卡不显示这一行 */}
      {isPhrase && (isEditMode || item.usage) && (
        <div className="mt-2 min-h-[24px]">
          {isEditMode ? (
            <AutoTextarea
              className="field-inline text-sm text-stone-500 font-sans leading-snug"
              placeholder="用法 / 搭配"
              aria-label="短语用法"
              value={localUsage}
              onChange={setLocalUsage}
              onBlur={handleSave}
            />
          ) : showChinese ? (
            <span className="text-sm text-stone-500 leading-snug block">{item.usage}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function SentenceCard({
  item,
  hideEnglish,
  hideChinese,
  isEditMode,
  onUpdateSentence,
  canSpeak,
  speaking,
  onSpeak
}: {
  item: Sentence
  hideEnglish: boolean
  hideChinese: boolean
  isEditMode: boolean
  onUpdateSentence?: (id: string, updates: Partial<Pick<Sentence, 'grammar' | 'meaning'>>) => void
  canSpeak: boolean
  speaking: boolean
  onSpeak: () => void
}) {
  // 遮住答案时，点一下卡片翻开 / 再点一下盖回去（触摸屏没有 hover，只能靠点）
  const [revealed, setRevealed] = useState(false)
  const showEnglish = !hideEnglish || revealed
  const showChinese = !hideChinese || revealed
  const [localGrammar, setLocalGrammar] = useState(item.grammar ?? '')
  const [localMeaning, setLocalMeaning] = useState(item.meaning ?? '')

  useEffect(() => {
    setLocalGrammar(item.grammar ?? '')
    setLocalMeaning(item.meaning ?? '')
  }, [item.id, item.grammar, item.meaning])

  const handleSave = () => {
    const nextGrammar = localGrammar.trim()
    const nextMeaning = localMeaning.trim()
    if (nextGrammar === (item.grammar ?? '') && nextMeaning === (item.meaning ?? '')) return
    onUpdateSentence?.(item.id, { grammar: nextGrammar, meaning: nextMeaning })
  }

  /** 同生词卡：离开编辑模式时兜底保存，不指望失焦事件一定来得及 */
  const saveRef = useRef(handleSave)
  saveRef.current = handleSave
  useEffect(() => {
    if (!isEditMode) return
    return () => saveRef.current()
  }, [isEditMode])

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-all min-h-[100px]"
      data-review-card=""
      onClick={(e) => {
        // 点在输入框 / 按钮上时不要连带翻开答案
        if ((e.target as HTMLElement).closest('input, textarea, button, select, a')) return
        setRevealed((v) => !v)
      }}
    >
      <div className="min-h-[28px] flex items-start gap-1">
        {showEnglish ? (
          <p className="flex-1">
            {/* 角标放在按钮**里面** —— 放外面的话，句子一换行按钮就占满整行宽，
                角标没位置只好掉到下一行独占一行。缘由见 AutoMark 的注释 */}
            <SpeakButton
              canSpeak={canSpeak}
              speaking={speaking}
              onSpeak={onSpeak}
              label="朗读这句"
              className="font-lyric-en font-serif text-base leading-snug text-left"
            >
              {item.text}
              {item.auto && <AutoMark />}
            </SpeakButton>
            {/* 正文改过、这条跟着变了。遮着答案时不显示，否则等于剧透 */}
            {item.sourceText && !item.orphaned && (
              <span className="mt-1 flex flex-wrap items-center gap-1.5">
                <EditedMark sourceText={item.sourceText} expanded={revealed || !hideEnglish} />
              </span>
            )}
          </p>
        ) : (
          <span className="text-ink-muted/70 text-sm">
            点击显示英文
          </span>
        )}
      </div>
      {isEditMode ? (
        <>
          {/* 类名对齐下面阅读态的那两行，切换模式时字不会挪位 */}
          <AutoTextarea
            className="field-inline mt-1 text-sm text-stone-500 font-sans"
            placeholder="句型 / 语法"
            aria-label="句型语法"
            value={localGrammar}
            onChange={setLocalGrammar}
            onBlur={handleSave}
          />
          <div className="mt-2 pt-2 border-t border-stone-100 min-h-[32px]">
            <AutoTextarea
              className="field-inline text-sm text-ink-muted leading-snug"
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
          {/* 句型 / 语法是用中文写的讲解，也是答案：隐藏中文时要和翻译一起遮
              （用户 2026-09-09 报的：翻译遮住了、讲解还亮着）。里面又常带着英文句型，
              所以隐藏英文时照旧也遮 */}
          {item.grammar && showEnglish && showChinese && (
            <p className="mt-1 text-sm text-stone-500 font-sans">{item.grammar}</p>
          )}
          {(item.meaning || !showChinese) && (
            <div className="mt-2 pt-2 border-t border-stone-100 min-h-[32px]">
              {showChinese && item.meaning ? (
                <span className="text-sm text-ink-muted leading-snug block">{item.meaning}</span>
              ) : (
                <span className="text-ink-muted/60 text-xs">
                  点击显示翻译
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 用 memo 包一层：阅读时每一帧滚动都会更新最外层的阅读进度状态，
 * 不隔离的话整棵树（含上千个单词节点）每帧重渲染一次，这正是滚动卡顿的来源。
 * props 没变就跳过渲染。
 */
export const VocabularyDashboard = memo(VocabularyDashboardInner)
