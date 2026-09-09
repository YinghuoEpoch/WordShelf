import { describe, it, expect } from 'vitest'
import { accentType, DEFAULT_SPEECH_PREFS, parseStoredSpeechPrefs } from './prefs'
import { AMERICAN, BRITISH } from './dictAudio'

describe('发音的两个开关', () => {
  it('没存过：美音、长按才发音', () => {
    expect(parseStoredSpeechPrefs(null)).toEqual(DEFAULT_SPEECH_PREFS)
    expect(DEFAULT_SPEECH_PREFS).toEqual({ accent: 'us', wordSpeak: 'longPress' })
  })

  it('存了就读得回来，三档都认', () => {
    expect(parseStoredSpeechPrefs(JSON.stringify({ accent: 'uk', wordSpeak: 'tap' }))).toEqual({
      accent: 'uk',
      wordSpeak: 'tap'
    })
    expect(parseStoredSpeechPrefs(JSON.stringify({ wordSpeak: 'off' })).wordSpeak).toBe('off')
    expect(parseStoredSpeechPrefs(JSON.stringify({ wordSpeak: 'longPress' })).wordSpeak).toBe('longPress')
  })

  it('老格式 tapToSpeak：true 变「点按也念」，false / 没有就是长按才念（升级上来行为不变）', () => {
    expect(parseStoredSpeechPrefs(JSON.stringify({ accent: 'uk', tapToSpeak: true }))).toEqual({
      accent: 'uk',
      wordSpeak: 'tap'
    })
    expect(parseStoredSpeechPrefs(JSON.stringify({ tapToSpeak: false })).wordSpeak).toBe('longPress')
  })

  it('认不出的口音退回美音；认不出的 wordSpeak 退回长按才念', () => {
    expect(parseStoredSpeechPrefs(JSON.stringify({ accent: 'au', wordSpeak: 'always' }))).toEqual(
      DEFAULT_SPEECH_PREFS
    )
    expect(parseStoredSpeechPrefs(JSON.stringify({ tapToSpeak: 'yes' }))).toEqual(DEFAULT_SPEECH_PREFS)
  })

  it('存的根本不是 JSON 时也不炸', () => {
    expect(parseStoredSpeechPrefs('{{{')).toEqual(DEFAULT_SPEECH_PREFS)
  })

  it('口音对应词典地址里的 type：英音 1、美音 2', () => {
    expect(accentType('uk')).toBe(BRITISH)
    expect(accentType('us')).toBe(AMERICAN)
  })
})
