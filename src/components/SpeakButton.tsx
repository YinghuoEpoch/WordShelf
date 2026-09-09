/**
 * 可朗读的那段英文：文字本身就是按钮，点一下读出来。
 *
 * **不放喇叭图标** —— 试过一版，摆在哪条中线上都别扭，
 * 而正在念的时候文字会变色，反馈已经够了。
 * 读不了的手机（没装朗读引擎）直接退回普通文字，不摆一个按了没反应的按钮。
 *
 * 从复习页搬出来单独成文件，抽卡那一屏也要用它。
 */
export function SpeakButton({
  canSpeak,
  speaking,
  onSpeak,
  label,
  className,
  children
}: {
  canSpeak: boolean
  speaking: boolean
  onSpeak: () => void
  label: string
  className: string
  children: React.ReactNode
}) {
  if (!canSpeak) return <span className={`${className} text-accent-800`}>{children}</span>

  return (
    <button
      type="button"
      onClick={onSpeak}
      aria-label={label}
      title={label}
      className={`${className} transition-colors ${speaking ? 'text-accent-500' : 'text-accent-800'}`}
    >
      {children}
    </button>
  )
}
