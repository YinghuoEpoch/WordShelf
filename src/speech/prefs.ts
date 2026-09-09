import { AMERICAN, BRITISH } from './dictAudio'

/**
 * 发音的两个开关（设置 → 发音）。用户 2026-09-08 加的：
 *
 * - **正文里的单词什么时候念**（三档，2026-09-09 加了第三档）：
 *   `longPress` 长按取词时顺带念一遍（从前的样子）；`tap` 轻点单词也念，不选中；
 *   `off` 正文里一律不念 —— 笔记栏点词、复习页的朗读键不归这里管，那是明着点的
 * - **英音 / 美音**：只对**词典真人录音**那一级有效（地址里 `type=1/2`，早就留着）。
 *   云端合成和手机引擎不受影响 —— 他的原话「第一个机制应该有切换英音美音的选项」
 *
 * 存本机 localStorage，不进数据库、不跟着同步走 —— 和云端朗读的凭证一个做法。
 *
 * 读的地方在事件里（点了词才问「要不要念」、要放录音了才问「哪种口音」），
 * 所以这里带一份内存快照：`getSpeechPrefs()` 不碰 localStorage，
 * 改了就通知订阅者，界面用 `useSpeechPrefs()`（useSyncExternalStore）跟着变。
 */

export type Accent = 'us' | 'uk'
/** 正文里的单词什么时候念：长按才念 / 点按也念 / 都不念 */
export type WordSpeak = 'longPress' | 'tap' | 'off'

export interface SpeechPrefs {
  accent: Accent
  wordSpeak: WordSpeak
}

export const DEFAULT_SPEECH_PREFS: SpeechPrefs = { accent: 'us', wordSpeak: 'longPress' }

export const ACCENT_LABEL: Record<Accent, string> = { us: '美音', uk: '英音' }

/** 词典地址里那个 type：1 英音、2 美音 */
export function accentType(accent: Accent): number {
  return accent === 'uk' ? BRITISH : AMERICAN
}

const KEY = 'lyric-vocab-speech-prefs'

/** 认不出的一律退回默认 —— 存的东西坏了不该让发音整个用不了 */
export function parseStoredSpeechPrefs(raw: string | null): SpeechPrefs {
  if (!raw) return DEFAULT_SPEECH_PREFS
  try {
    const parsed = JSON.parse(raw) as (Partial<SpeechPrefs> & { tapToSpeak?: unknown }) | null
    const ws = parsed?.wordSpeak
    return {
      accent: parsed?.accent === 'uk' || parsed?.accent === 'us' ? parsed.accent : DEFAULT_SPEECH_PREFS.accent,
      wordSpeak:
        ws === 'longPress' || ws === 'tap' || ws === 'off'
          ? ws
          : // 老格式：tapToSpeak 那个布尔。true 就是「点按也念」，其余都是从前的默认
            parsed?.tapToSpeak === true
            ? 'tap'
            : DEFAULT_SPEECH_PREFS.wordSpeak
    }
  } catch {
    return DEFAULT_SPEECH_PREFS
  }
}

function load(): SpeechPrefs {
  try {
    return parseStoredSpeechPrefs(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_SPEECH_PREFS
  }
}

let snapshot: SpeechPrefs | null = null
const listeners = new Set<() => void>()

/** 当前的设置。第一次读 localStorage，之后是内存里那份 */
export function getSpeechPrefs(): SpeechPrefs {
  if (!snapshot) snapshot = load()
  return snapshot
}

export function saveSpeechPrefs(next: SpeechPrefs): void {
  snapshot = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 存不下就这一趟有效
  }
  listeners.forEach((fn) => fn())
}

export function subscribeSpeechPrefs(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
