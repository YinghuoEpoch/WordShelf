/**
 * 「一键填充」填哪几类：单词 / 短语 / 句子，可多选。
 *
 * 用户 2026-09-08 提的：「可以选择是让 ai 只填充单词、短语还是句子，也可以多选。」
 * 记在本机 localStorage，和划词的选项（mark/options.ts）一个做法 —— 只是顺手的默认值。
 */

export interface FillOptions {
  word: boolean
  phrase: boolean
  sentence: boolean
}

export type FillKind = keyof FillOptions

export const FILL_KINDS: FillKind[] = ['word', 'phrase', 'sentence']

export const FILL_KIND_LABEL: Record<FillKind, string> = {
  word: '单词',
  phrase: '短语',
  sentence: '句子'
}

export const DEFAULT_FILL_OPTIONS: FillOptions = { word: true, phrase: true, sentence: true }

const KEY = 'lyric-vocab-fill-options'

/** 认不出的、或三个全关的，一律退回默认（全开） */
export function parseStoredFillOptions(raw: string | null): FillOptions {
  if (!raw) return DEFAULT_FILL_OPTIONS
  try {
    const parsed = JSON.parse(raw) as Partial<FillOptions> | null
    const out: FillOptions = {
      word: parsed?.word !== false,
      phrase: parsed?.phrase !== false,
      sentence: parsed?.sentence !== false
    }
    return out.word || out.phrase || out.sentence ? out : DEFAULT_FILL_OPTIONS
  } catch {
    return DEFAULT_FILL_OPTIONS
  }
}

export function loadFillOptions(): FillOptions {
  try {
    return parseStoredFillOptions(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_FILL_OPTIONS
  }
}

export function saveFillOptions(options: FillOptions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(options))
  } catch {
    // 存不下就算了
  }
}
