// 优先级计算 —— 知先的算法内核
//
// 依据：PRD 的 F2（自动优先级计算）与 F5（可解释排序）；TECH_DESIGN 第五节。
//
// 设计已由项目主人拍板（2026-09-22，Day 7）：
//   ① 「分段排」——**紧急的（已逾期或 7 天内到期，即紧迫度 > 0）全排在前面**，
//      7 天以外的（含没填期限的）同等对待，一起按分数排；
//   ② 三因子权重 40 / 40 / 20（紧迫度 / 重要度 / 省时度）。
//
// 关于 ①：最初写的是「有期限的全排在无期限之前」，实测发现它会自相矛盾 ——
// 一件 6 个月后才交的事（紧迫度 0，公式已认定不紧急）仅因为填了日期就插到前面，
// 压住「很重要但没设期限」的任务。现改为与算分共用 urgencyOf()，见下方 isUrgent()。
//
// 本文件属于 core/：纯 TypeScript，**不依赖 React**，因而能被独立测试。
//
// ⚠️ 关键约定（TECH_DESIGN 第五节）：**这里产出的值全是派生值，一律不入库。**
// 理由：权重一旦调整，存下来的分数就全过期了；实时算才能保证界面上的分数永远和当前公式一致。

import type { Importance, Task } from './types'

// ---------- 可调参数（集中放这里，调参只改这一处）----------

/** 三个因子的权重。三者相加必须等于 1。 */
export const WEIGHTS = {
  urgency: 0.4,
  importance: 0.4,
  quickWin: 0.2,
} as const

/**
 * 紧迫度的观察窗口：7 天。
 * 一周是人的规划周期 —— 超过一周的事，现在焦虑也没用，所以 7 天以外紧迫度记 0。
 */
export const URGENCY_WINDOW_DAYS = 7

/** 预计耗时未填时，省时度取这个中性值：未知既不加分也不减分。 */
export const UNKNOWN_ESTIMATE_NEUTRAL = 0.5

const DAY_MS = 24 * 60 * 60 * 1000

// ---------- 输出结构 ----------

/** 一个因子的明细 */
export interface PriorityFactor {
  /** 给人看的因子名 */
  label: string
  /** 归一化后的值，0 ~ 1 */
  value: number
  /** 这一项实际贡献了多少分（0 ~ 100 之间的一个数） */
  points: number
}

/** 一条人话理由 */
export interface PriorityReason {
  text: string
  points: number
}

/** 一个任务的完整算分结果 */
export interface PriorityResult {
  taskId: string
  /** 总分 0 ~ 100 */
  score: number
  /** 有没有填截止时间（用于界面标注「无期限」） */
  hasDue: boolean
  /**
   * 要不要插到队列前段。
   *
   * **这是排序分段的唯一依据**，取值等价于「紧迫度 > 0」，也就是「已逾期或 7 天内到期」。
   *
   * 为什么不直接用 hasDue：那会让「有截止时间」本身成为优先理由，
   * 于是「6 个月后到期、重要性不高」的任务（紧迫度 0 分，公式已认定它不紧急）
   * 会插到「很重要但没设期限」的任务前面 —— 同一个系统里两处判断打架。
   * 现在两者共用 urgencyOf()，只有一个真相来源。
   */
  isUrgent: boolean
  /** 三个因子的明细 */
  factors: {
    urgency: PriorityFactor
    importance: PriorityFactor
    quickWin: PriorityFactor
  }
  /** 人话理由，按贡献从大到小，最多 2 条 */
  reasons: PriorityReason[]
}

// ---------- 三个因子的归一化 ----------

/**
 * 紧迫度：离截止越近越大；7 天外为 0；已过期为 1（顶格）。
 * 没有截止时间 → 记 0（PRD 第七节：「不参与紧迫度计算」）。
 */
export function urgencyOf(dueAt: string | null, now: Date): number {
  if (dueAt === null) return 0

  const due = new Date(dueAt)
  // 截止时间解析不出来时，当作「没有截止时间」处理，不让它污染计算
  if (Number.isNaN(due.getTime())) return 0

  const daysLeft = (due.getTime() - now.getTime()) / DAY_MS
  if (daysLeft <= 0) return 1
  if (daysLeft >= URGENCY_WINDOW_DAYS) return 0
  return 1 - daysLeft / URGENCY_WINDOW_DAYS
}

/** 重要度归一：1 星 = 0，5 星 = 1 */
export function importanceOf(stars: Importance): number {
  return (stars - 1) / 4
}

/**
 * 省时度：越快越大，用 1 ÷ (1 + 分钟 ÷ 60) 这条平滑曲线。
 *
 * 几个参照点：15 分钟 → 0.80，1 小时 → 0.50，3 小时 → 0.25。
 * 用平滑曲线而不是分段，是为了避免「刚好 15 分钟满分、16 分钟掉一大截」的断层。
 */
export function quickWinOf(minutes: number | null): number {
  if (minutes === null) return UNKNOWN_ESTIMATE_NEUTRAL
  if (minutes <= 0) return 1
  return 1 / (1 + minutes / 60)
}

/**
 * 判断一个任务算不算「紧急」—— 也就是要不要插到队列前段。
 *
 * 判据**就是紧迫度大于 0**，而不是「有没有填截止时间」。
 * 这样分段（排序）与算分（公式）用的是同一个真相，不会互相矛盾。
 *
 * 直觉解释：一件半年后才交的事，现在并不紧急，
 * 不该因为它「填了个日期」就压住一件你很想做、且很重要的事。
 */
export function isUrgent(dueAt: string | null, now: Date): boolean {
  return urgencyOf(dueAt, now) > 0
}

// ---------- 主函数 ----------

/**
 * 算出一个任务的优先级。
 *
 * @param task 待算的任务
 * @param now  当前时刻。作为参数传进来（而不是内部取 now），
 *             是为了让这个函数成为**纯函数** —— 同样的输入永远给同样的输出，测试才可信。
 */
export function computePriority(task: Task, now: Date): PriorityResult {
  const urgency = urgencyOf(task.dueAt, now)
  const importance = importanceOf(task.importance)
  const quickWin = quickWinOf(task.estimateMinutes)

  const contributions = {
    urgency: WEIGHTS.urgency * urgency * 100,
    importance: WEIGHTS.importance * importance * 100,
    quickWin: WEIGHTS.quickWin * quickWin * 100,
  }

  let score = contributions.urgency + contributions.importance + contributions.quickWin

  // 兜底（TECH_DESIGN 第八节）：算出 NaN / Infinity 时退回最低优先级并留日志，
  // 宁可让这个任务排到最后，也不能让整个界面崩掉。
  if (!Number.isFinite(score)) {
    console.warn('[知先] 优先级算出了异常分数，已兜底为 0', {
      taskId: task.id,
      title: task.title,
      urgency,
      importance,
      quickWin,
    })
    score = 0
  }

  return {
    taskId: task.id,
    score,
    hasDue: task.dueAt !== null,
    isUrgent: isUrgent(task.dueAt, now),
    factors: {
      urgency: { label: '紧迫度', value: urgency, points: contributions.urgency },
      importance: { label: '重要度', value: importance, points: contributions.importance },
      quickWin: { label: '省时度', value: quickWin, points: contributions.quickWin },
    },
    reasons: buildReasons(task, now, contributions),
  }
}

// ---------- 人话理由（PRD F5）----------

/**
 * 挑出「把它抬上去的」具体是哪几项。
 *
 * 做法：看三项各自贡献了多少分，**只取正贡献**，按贡献从大到小取前 2 条。
 * 这样解释里列的是真正起作用的项，而不是一句「系统推荐」。
 */
function buildReasons(
  task: Task,
  now: Date,
  contributions: { urgency: number; importance: number; quickWin: number },
): PriorityReason[] {
  const candidates: PriorityReason[] = [
    { text: describeDue(task.dueAt, now), points: contributions.urgency },
    { text: `重要度 ${task.importance} 星`, points: contributions.importance },
    { text: describeEstimate(task.estimateMinutes), points: contributions.quickWin },
  ]

  const positive = candidates
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)

  if (positive.length === 0) {
    // 三项全是 0 —— 说明这任务既不紧急、也不重要、还费时
    return [{ text: '各项都不突出，只能往后排', points: 0 }]
  }

  return positive
}

/** 把截止时间说成人话 */
function describeDue(dueAt: string | null, now: Date): string {
  if (dueAt === null) return '没有截止时间'

  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return '截止时间无法识别'

  const daysLeft = (due.getTime() - now.getTime()) / DAY_MS

  if (daysLeft <= 0) {
    const overdueDays = Math.ceil(-daysLeft)
    return overdueDays <= 1 ? '已经逾期' : `已逾期 ${overdueDays} 天`
  }

  // 不到一天就按小时说，更贴近「今天要交」的紧迫感
  if (daysLeft < 1) {
    const hours = Math.max(1, Math.round(daysLeft * 24))
    return `还剩 ${hours} 小时`
  }

  const days = Math.round(daysLeft)
  if (days === 1) return '明天截止'
  if (days === 2) return '后天截止'
  return `${days} 天后截止`
}

/** 把预计耗时说成人话 */
function describeEstimate(minutes: number | null): string {
  if (minutes === null) return '耗时没估算，按中性计'
  if (minutes < 60) return `只需 ${minutes} 分钟`

  const hours = minutes / 60
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  return `预计要 ${text} 小时`
}
