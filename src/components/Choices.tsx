/** 一排等宽的单选按钮。字体和纸色长得一样，所以收成一个。云端同步那一屏也用 */
export function Choices<T extends string>({
  value,
  options,
  onPick
}: {
  value: T
  options: ReadonlyArray<{ id: T; label: string }>
  onPick: (id: T) => void
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(o.id)}
          className={
            'flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ' +
            (value === o.id
              ? 'border-accent-500 bg-accent-50 text-accent-800'
              : 'border-paper-border bg-white text-ink-muted hover:bg-stone-100')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
