// 内置示例数据 —— 「期末周冲刺」
//
// 依据：PRD 第三节 F9（内置示例数据）、第七节（一个任务都没有时给「载入示例数据」按钮）。
//
// 为什么要有这份数据：
//   第一次打开时队列是空的，而「空队列」恰恰看不出知先好在哪 —— 排序是它的全部价值，
//   没有数据就没有排序。这份示例让「自动排序」一眼可见，而且每一条都对着算法的一个判据：
//
//   · 已逾期 / 7 天内到期 → 插到队列前段（判据是紧迫度 > 0）
//   · 30 天后到期         → 紧迫度 0，与「无期限」同等对待，一起按分数排
//                           （防止「填了个日期就插到前面」的自相矛盾）
//   · 没填预计耗时        → 省时度取中性值 0.5，不凭空加分
//   · 各项都不突出        → 排到最后，理由会写「各项都不突出」
//
// ⚠️ 截止时间是**相对「现在」算出来的**，不是写死的日期。
// 写死日期的话，过几天再打开这份示例，全都成了「已逾期」，示例就废了。
// 所以这里导出的是 buildSampleTasks(now) 而不是一个常量数组 ——
// 把时刻当参数传进来，保证「同样的 now 给同样的结果」，可复现、可测试。

import type { Importance, Task } from '../core/types'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/** 一条示例的「配方」：截止时间写成「距现在几小时」，其余字段照常 */
interface SampleSpec {
  id: string
  title: string
  /** 距现在多少小时到期；null 表示没有期限 */
  dueInHours: number | null
  /** 预计耗时（分钟）；null 表示未估算 */
  estimateMinutes: number | null
  importance: Importance
}

const SAMPLE_SPECS: readonly SampleSpec[] = [
  // 逾期 —— 紧迫度顶格，排最前
  { id: 'sample-03', title: '补交上周的实验报告', dueInHours: -20, estimateMinutes: 30, importance: 3 },
  // 7 天内 —— 也算紧急
  { id: 'sample-02', title: '复习高数第六章（明早小测）', dueInHours: 9, estimateMinutes: 45, importance: 4 },
  { id: 'sample-01', title: '交《数据结构》课程设计报告', dueInHours: 30, estimateMinutes: 120, importance: 5 },
  { id: 'sample-04', title: '写完社团活动策划书', dueInHours: 120, estimateMinutes: 90, importance: 4 },
  // 7 天以外 —— 紧迫度 0，靠分数取胜
  { id: 'sample-06', title: '准备开题答辩（下个月）', dueInHours: 720, estimateMinutes: 180, importance: 5 },
  // 无期限 —— 与「7 天以外」同等对待
  { id: 'sample-05', title: '背 50 个四级核心词', dueInHours: null, estimateMinutes: 20, importance: 2 },
  // 没估耗时 + 低重要度 —— 排最后，理由会显示「各项都不突出」
  { id: 'sample-07', title: '整理宿舍书桌', dueInHours: null, estimateMinutes: null, importance: 1 },
]

/**
 * 按给定的「现在」造出 7 条示例任务。
 *
 * @param now 当前时刻。必须由调用方传入，这样示例数据是**可复现**的 ——
 *            同一天跑两次得到同一批数据，验证脚本才能写出稳定的断言。
 */
export function buildSampleTasks(now: Date): Task[] {
  const base = now.getTime()

  return SAMPLE_SPECS.map((spec, index): Task => ({
    id: spec.id,
    title: spec.title,
    dueAt: spec.dueInHours === null ? null : new Date(base + spec.dueInHours * HOUR_MS).toISOString(),
    estimateMinutes: spec.estimateMinutes,
    importance: spec.importance,
    status: 'todo',
    // 创建时间错开一分钟，保证同分时也有确定的先后（PRD F3 要求顺序稳定可复现）
    createdAt: new Date(base - (SAMPLE_SPECS.length - index) * MINUTE_MS).toISOString(),
  }))
}
