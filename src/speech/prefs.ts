import { AMERICAN, BRITISH } from './dictAudio'

/**
 * 发音的两个开关（设置 → 发音）。用户 2026-09-08 加的：
 *
 * - **点按单词发音**：从前只有长按取词时顺带念一遍；开了之后轻点单词也念，不选中
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

export interface SpeechPrefs {
  accent: Accent
  tapToSpeak: boolean
}

export const DEFAULT_SPEECH_PREFS: SpeechPrefs = { accent: 'us', tapToSpeak: false }

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
    const parsed = JSON.parse(raw) as Partial<SpeechPrefs> | null
    return {
      accent: parsed?.accent === 'uk' || parsed?.accent === 'us' ? parsed.accent : DEFAULT_SPEECH_PREFS.accent,
      tapToSpeak: parsed?.tapToSpeak === true
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
