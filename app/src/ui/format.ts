// 界面层的小工具 —— 只在 ui/ 里用，不放进 core/
//
// 为什么不放 core/：core/ 是「业务算法层」，要求纯 TS、能被独立测试、
// 将来转小程序时直接复用。而「1.5 小时」这种写法是**给人看的文案**，
// 属于界面层的事 —— 换个界面（小程序、命令行）可能就换成别的写法了。
// 分界线划在「算得对不对」和「说得顺不顺」之间。
//
// ⚠️ Day 23 把原来的 describeError 从这里**删掉了**。
//    它干的事只有一件：`error instanceof Error ? error.message : String(error)`。
//    问题是 `message` 是抛的人写的 —— 浏览器抛的异常全是英文，
//    于是「保存失败：QuotaExceededError」这样的半截英文就漏到了界面上。
//    替代品是 `./errors.ts` 的 `explainError()`：先分类，再决定说什么。
//    别再往这个文件里加「取 message」这类东西 —— 那是修复之前的老做法。

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
