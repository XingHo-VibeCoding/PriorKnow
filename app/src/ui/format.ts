// 界面层的两个小工具 —— 只在 ui/ 里用，不放进 core/
//
// 为什么不放 core/：core/ 是「业务算法层」，要求纯 TS、能被独立测试、
// 将来转小程序时直接复用。而「1.5 小时」这种写法是**给人看的文案**，
// 属于界面层的事 —— 换个界面（小程序、命令行）可能就换成别的写法了。
// 分界线划在「算得对不对」和「说得顺不顺」之间。

/**
 * 把分钟数说成人话。
 *
 * 90 → 「1.5 小时」；45 → 「45 分钟」；180 → 「3 小时」。
 * 整小时不显示小数点（「3 小时」比「3.0 小时」自然）。
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`

  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}

/**
 * 把任意异常统一成一句能读的话。
 *
 * catch 到的东西不一定是 Error（可能是字符串、甚至对象），
 * 直接 `${err}` 在有些情况下会得到「[object Object]」，所以这里统一收口。
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
