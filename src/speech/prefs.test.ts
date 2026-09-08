import { describe, it, expect } from 'vitest'
import { accentType, DEFAULT_SPEECH_PREFS, parseStoredSpeechPrefs } from './prefs'
import { AMERICAN, BRITISH } from './dictAudio'

describe('发音的两个开关', () => {
  it('没存过：美音、点按不发音', () => {
    expect(parseStoredSpeechPrefs(null)).toEqual(DEFAULT_SPEECH_PREFS)
    expect(DEFAULT_SPEECH_PREFS).toEqual({ accent: 'us', tapToSpeak: false })
  })

  it('存了就读得回来', () => {
    expect(parseStoredSpeechPrefs(JSON.stringify({ accent: 'uk', tapToSpeak: true }))).toEqual({
      accent: 'uk',
      tapToSpeak: true
    })
  })

  it('认不出的口音退回美音；tapToSpeak 只认 true', () => {
    expect(parseStoredSpeechPrefs(JSON.stringify({ accent: 'au', tapToSpeak: 'yes' }))).toEqual(
      DEFAULT_SPEECH_PREFS
    )
  })

  it('存的根本不是 JSON 时也不炸', () => {
    expect(parseStoredSpeechPrefs('{{{')).toEqual(DEFAULT_SPEECH_PREFS)
  })

  it('口音对应词典地址里的 type：英音 1、美音 2', () => {
    expect(accentType('uk')).toBe(BRITISH)
    expect(accentType('us')).toBe(AMERICAN)
  })
})
