import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { AiSettingsPanel } from './AiSettingsPanel'
import { describeTarget, loadConfig, resolveConfig, type AiConfig } from '../enrich'
import {
  FILL_KINDS,
  FILL_KIND_LABEL,
  loadFillOptions,
  saveFillOptions,
  type FillKind,
  type FillOptions
} from '../enrich/fillOptions'
import type { FillProgress } from '../enrich'
import { useBackHandler, BackPriority } from '../hooks/useBackHandler'

/**
 * 「一键填充」对话框。
 *
 * 第一次用会先要 AI 设置（用哪家、Key 是什么）—— 不做成设置页里的一项，
 * 是因为它只在这里用得上，放在用得到的地方最好找。
 */

export type FillPhase = 'idle' | 'running' | 'done' | 'error'

export interface AutoFillState {
  phase: FillPhase
  progress: FillProgress
  /** 出错或被中断时的说明 */
  message?: string
}

interface AutoFillDialogProps {
  open: boolean
  /** 待填充的数量（还有格子没填的笔记，不必整条空白） */
  pendingWords: number
  pendingPhrases: number
  pendingSentences: number
  /** 当前范围的名字，例如某个文库或某篇文档 */
  scopeName: string
  state: AutoFillState
  onStart: (options: FillOptions) => void
  onCancel: () => void
  onClose: () => void
}

export function AutoFillDialog({
  open,
  pendingWords,
  pendingPhrases,
  pendingSentences,
  scopeName,
  state,
  onStart,
  onCancel,
  onClose
}: AutoFillDialogProps) {
  /**
   * 编辑中的配置必须放进 state。
   * 直接在渲染时读 localStorage 的话，保存之后没有任何 state 变化，
   * 组件不会重渲染，界面就一直停在「请填 Key」那一屏。
   *
   * **初值必须当场读出来**，不能先给一份空配置等 effect 再填：
   * 那样第一次打开会先按「还没设过 AI」渲染一帧，密码输入框一闪而过 ——
   * 手机上足够让安全键盘弹出来，而框随即消失，键盘就再也关不掉了。
   */
  const [saved, setSaved] = useState<AiConfig>(loadConfig)
  const [editing, setEditing] = useState(false)
  /** 填哪几类。初值当场读出来，不留「先渲染一帧默认再跳成上次那样」的闪烁 */
  const [options, setOptions] = useState<FillOptions>(loadFillOptions)

  const ready = resolveConfig(saved) !== null
  const needSetup = !ready || editing
  const running = state.phase === 'running'
  const savedTarget = describeTarget(saved)

  useEffect(() => {
    if (open) {
      setSaved(loadConfig())
      setEditing(false)
      setOptions(loadFillOptions())
    }
  }, [open])

  // 返回键：跑的时候先取消，闲着的时候直接关
  useBackHandler(open, BackPriority.orphanPrompt, () => (running ? onCancel() : onClose()))

  if (!open) return null

  const pending: Record<FillKind, number> = {
    word: pendingWords,
    phrase: pendingPhrases,
    sentence: pendingSentences
  }
  /** 选中的那几类一共有多少条要填 —— 没选的不算，按钮上的数和进度都以它为准 */
  const total = FILL_KINDS.reduce((n, k) => n + (options[k] ? pending[k] : 0), 0)
  const nothingPending = pendingWords + pendingPhrases + pendingSentences === 0

  /** 可多选，但至少留一个 —— 三个都关等于没得填，最后那个点不掉 */
  const toggle = (kind: FillKind) => {
    const next = { ...options, [kind]: !options[kind] }
    if (!next.word && !next.phrase && !next.sentence) return
    setOptions(next)
    saveFillOptions(next)
  }

  const percent =
    state.progress.total > 0 ? Math.round((state.progress.done / state.progress.total) * 100) : 0

  /**
   * 点弹窗外面的空白处：关掉。和设置弹窗一个做法（遮罩接点击、卡片挡住冒泡）。
   *
   * 两处例外，都是照着这个弹窗已有的规矩来的：
   * - **跑着的时候不响应**。右上角那颗关闭键此时本来就是藏起来的
   *   （`{!running && ...}`），点外面要是能关，等于给它开了个后门，
   *   手一滑就把正在跑的任务打断了。安卓返回键另有规矩（跑着时按返回 = 取消任务），
   *   那是明确的一次按键，不算误触，所以不动它。
   * - **在「AI 设置」那一屏时退回上一屏**，而不是整个关掉 —— 和设置弹窗一致。
   */
  const closeOnBackdrop = () => {
    if (running) return
    if (editing) return setEditing(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 kb-safe"
      onClick={closeOnBackdrop}
    >
      <div
        className="max-w-sm w-[90%] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-paper-border p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-600" />
            {needSetup ? 'AI 设置' : '一键填充'}
          </h2>
          {!running && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-ink-muted hover:bg-stone-100"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {needSetup ? (
          <AiSettingsPanel
            onSaved={(cfg) => {
              setSaved(cfg)
              setEditing(false)
            }}
            onCancel={ready ? () => setEditing(false) : undefined}
          />
        ) : (
          <>
            <p className="text-xs text-ink-muted leading-relaxed">
              将为「{scopeName}」里
              <span className="text-ink font-medium">还有格子空着</span>
              的笔记补上：单词补音标、词性、中文释义；短语补释义与用法；句子补句型说明与翻译。
              <span className="text-ink font-medium">只补空着的那几格，你写过的一个字都不动。</span>
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-muted">填哪几类（可多选）</p>
              <div className="flex gap-1.5">
                {FILL_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={running}
                    onClick={() => toggle(k)}
                    aria-pressed={options[k]}
                    className={
                      'flex-1 h-8 rounded-lg text-sm border disabled:opacity-40 ' +
                      (options[k]
                        ? 'border-accent-500 bg-accent-50 text-accent-800 font-medium'
                        : 'border-paper-border text-ink-muted hover:bg-stone-50')
                    }
                  >
                    {FILL_KIND_LABEL[k]}
                    <span className={'ml-1 text-xs ' + (options[k] ? 'text-accent-700/80' : 'text-ink-muted')}>
                      {pending[k]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted">
                {nothingPending
                  ? '都填全了'
                  : total === 0
                    ? '选中的这几类都填全了'
                    : `待填充 ${total} 条`}
              </p>
            </div>

            {running && (
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full bg-accent-500 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-ink-muted">
                  已处理 {state.progress.done} / {state.progress.total}，
                  成功填上 {state.progress.filled} 条
                </p>
              </div>
            )}

            {state.phase === 'done' && (
              <p className="text-sm text-ink">
                完成，共填上 {state.progress.filled} 条。
                {state.message && <span className="text-ink-muted"> {state.message}</span>}
              </p>
            )}

            {state.phase === 'error' && (
              <p className="text-sm text-red-600 leading-relaxed break-words">{state.message}</p>
            )}

            <p className="text-xs text-ink-muted leading-relaxed">
              内容由 AI 生成，会标上「AI」记号，可能有错，建议复核。
              单词和它所在的那一行会被发送给 <span className="break-all">{savedTarget}</span>。
            </p>

            <div className="flex gap-2 pt-1">
              {running ? (
                <button
                  type="button"
                  className="flex-1 h-9 rounded-lg border border-stone-300 text-stone-600 text-sm hover:bg-stone-50"
                  onClick={onCancel}
                >
                  停止（已填的会保留）
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg border border-stone-300 text-stone-600 text-sm hover:bg-stone-50"
                    onClick={() => setEditing(true)}
                  >
                    AI 设置
                  </button>
                  <button
                    type="button"
                    disabled={total === 0}
                    className="flex-1 h-9 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-40 text-white text-sm font-medium"
                    onClick={() => onStart(options)}
                  >
                    {state.phase === 'done' || state.phase === 'error' ? '再试一次' : '开始填充'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
