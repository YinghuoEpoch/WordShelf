/**
 * 「这是不是平板」—— 只给**一次性的默认值**用（比如首次安装时的默认字号）。
 *
 * 布局那条线（useWideLayout 的 1024）量的是「此刻可用宽度」，平板竖屏会落到手机那边，
 * 那对布局是对的。但默认字号是按「屏幕多大」定的，转个屏不该变，
 * 所以这里看屏幕的**短边**：安卓把短边 ≥ 600dp 叫平板（sw600dp），照它来。
 *
 * ⚠️ 别拿这个值分叉交互逻辑。按设备种类分叉最后总会变成两套各自长歪的逻辑（见 useWideLayout 头注）。
 */
export const TABLET_MIN_SHORT_SIDE_PX = 600

export function isTabletClass(screen: { width: number; height: number } | undefined = globalThis.screen): boolean {
  if (!screen) return false
  return Math.min(screen.width, screen.height) >= TABLET_MIN_SHORT_SIDE_PX
}
