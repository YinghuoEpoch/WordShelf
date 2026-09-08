import { useSyncExternalStore } from 'react'
import { getSpeechPrefs, subscribeSpeechPrefs, type SpeechPrefs } from '../speech/prefs'

/** 发音的两个开关，改了界面跟着变。改的地方调 saveSpeechPrefs */
export function useSpeechPrefs(): SpeechPrefs {
  return useSyncExternalStore(subscribeSpeechPrefs, getSpeechPrefs, getSpeechPrefs)
}
