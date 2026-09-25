// 今日预算条 —— PRD 5.1 视图一顶部的「今天还剩多少时间」
//
// 它回答一个具体问题：**按队列顺序做下去，今天大概能做几件。**
// 这件事只有「队列顺序」和「每件的耗时」凑在一起才算得出来 ——
// 所以预算条必须拿到算好分的队列，这也是它和队列共用 useTaskQueue 的原因。
//
// ⚠️ 预算**不参与优先级算分**。分数回答「该不该先做」，预算回答「今天做不做得完」，
// 是两件事，混在一起会让分数变得不可解释（也违反 PRD F2「分数只由三因子决定」）。

import { useEffect, useMemo, useState } from 'react'
import type { QueueEntry } from '../core/priorityQueue'
import { formatMinutes } from './format'

const STORAGE_KEY = 'priorknow.budget-minutes'
const DEFAULT_MINUTES = 180

interface TodayBudgetProps {
  /** 排好序的待办队列 */
  ranked: QueueEntry[]
  /** 队列读完了没有 —— 没读完时先不报「能做几件」，免得给出错的数 */
  loaded: boolean
}

export function TodayBudget({ ranked, loaded }: TodayBudgetProps) {
  // 输入框用字符串存，因为「空」是个有意义的状态（还没填），number 表达不了它
  const [raw, setRaw] = useState<string>(() => readStoredMinutes())

  // 预算属于「设置」，不属于任务数据，所以存 localStorage 而不是任务库 ——
  // 导出任务 JSON 时不该把预算也带上（那是另一件事）。
  useEffect(() => {
    const minutes = parseMinutes(raw)
    try {
      if (minutes === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(minutes))
    } catch {
      // 隐私模式下 localStorage 可能不可写。预算是锦上添花，写不进去也不该让页面报错。
    }
  }, [raw])

  const minutes = parseMinutes(raw)
  const plan = useMemo(() => planToday(ranked, minutes), [ranked, minutes])

  // PRD 第七节：预算小于最短任务耗时 → 明确说「不够完成任何一项」，并给两条出路
  const notEnough = minutes !== null && plan.shortest !== null && minutes < plan.shortest.minutes

  return (
    <section className="card budget">
      <h2>今日预算</h2>

      <div className="budget-row">
        <label className="budget-label" htmlFor="budget-input">
          今天还剩多少时间
        </label>
        <div className="budget-input-wrap">
          <input
            id="budget-input"
            className="budget-input"
            type="number"
            min="1"
            step="10"
            placeholder="分钟"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            aria-label="今日可用时间（分钟）"
          />
          <span className="budget-unit">分钟</span>
          {minutes !== null && <span className="budget-approx">≈ {formatMinutes(minutes)}</span>}
        </div>
      </div>

      {!loaded ? (
        <p className="budget-note">正在读取队列…</p>
      ) : ranked.length === 0 ? (
        <p className="budget-note">队列还是空的 —— 先加一件任务，这里就能算出今天做得完几件。</p>
      ) : minutes === null ? (
        <p className="budget-note">
          队列共 <strong>{ranked.length}</strong> 件，其中能估耗时的 {plan.estimated} 件合计{' '}
          {formatMinutes(plan.used)}。填一个分钟数，我帮你估今天做得完几件。
        </p>
      ) : notEnough && plan.shortest !== null ? (
        // 注意这里**不显示空列表** —— 队列就在下面，照常列出全部任务
        <div className="budget-warn">
          <p className="budget-warn-title">今天的时间不够完成任何一项</p>
          <p className="budget-warn-sub">
            队列里最省时的「{plan.shortest.title}」也要 {plan.shortest.minutes} 分钟，而今天只剩{' '}
            {minutes} 分钟。两条出路：① 把上面的预算改大一点；② 先只挑这一件小的做 ——
            下面的队列照常显示全部任务，不受影响。
          </p>
        </div>
      ) : (
        <>
          <p className="budget-sum">
            按队列顺序，今天大约能完成 <strong>{plan.count}</strong> 件 · 累计{' '}
            {formatMinutes(plan.used)} / {formatMinutes(minutes)}
          </p>

          <div
            className="budget-bar"
            role="img"
            aria-label={`已排 ${formatMinutes(plan.used)}，预算 ${formatMinutes(minutes)}`}
          >
            <span
              className="budget-bar-fill"
              style={{ width: `${fillPercent(plan.used, minutes)}%` }}
            />
          </div>

          {plan.count === 0 && plan.blocker !== null && (
            <p className="budget-note">
              第一件「{plan.blocker.title}」要 {plan.blocker.minutes} 分钟，装不进今天的 {minutes}{' '}
              分钟 —— 要么改大预算，要么先做队列里更小的一件。
            </p>
          )}

          {plan.unknown > 0 && (
            <p className="budget-note">
              另有 {plan.unknown} 件没填预计耗时，没算进累计（未估算的不占预算，但也没法保证今天做得完）。
            </p>
          )}
        </>
      )}
    </section>
  )
}

// ---------- 计算 ----------

/** 一个「有耗时的任务」的摘要 —— 只留报数需要的两个字段，不用整个 QueueEntry */
interface MinutesRef {
  title: string
  minutes: number
}

interface TodayPlan {
  /** 预算内按队列顺序能做完几件 */
  count: number
  /** 这几件累计耗时（分钟） */
  used: number
  /** 队列里没填耗时、无法计入累计的件数 */
  unknown: number
  /** 队列里能估耗时的件数 */
  estimated: number
  /** 最省时的那一项（用来解释「不够任何一项」） */
  shortest: MinutesRef | null
  /** 第一件就装不下的那一项（预算够最小件、但第一件太大时用） */
  blocker: MinutesRef | null
}

/**
 * 按队列顺序累加耗时，算出今天装得下几件。
 *
 * 规则是**顺序累加、装不下就停**，不做「跳过大的挑小的」这种优化。
 * 理由：队列顺序本身就是「该先做什么」的答案；跳过第一件去捡第三件，
 * 等于用预算把排序结果推翻了 —— 那预算就变成第二个排序器了。
 * 真遇到第一件装不下，界面会把这件事说出来（见上面的 blocker 提示），让用户自己决定。
 */
function planToday(ranked: QueueEntry[], budget: number | null): TodayPlan {
  let count = 0
  let used = 0
  let unknown = 0
  let estimated = 0
  let shortest: MinutesRef | null = null
  let blocker: MinutesRef | null = null

  for (const entry of ranked) {
    const minutes = entry.task.estimateMinutes

    // 未估算的不计入累计：不知道要多久，就不能算进「今天做得完」
    if (minutes === null) {
      unknown += 1
      continue
    }

    estimated += 1
    if (shortest === null || minutes < shortest.minutes) {
      shortest = { title: entry.task.title, minutes }
    }

    if (budget !== null && used + minutes > budget) {
      // 装不下，停在这里（预算没填时不会走到这儿）
      if (count === 0) blocker = { title: entry.task.title, minutes }
      break
    }

    count += 1
    used += minutes
  }

  return { count, used, unknown, estimated, shortest, blocker }
}

/** 进度条宽度。累加时已保证 used ≤ budget，这里再夹一次，防止除零和溢出。 */
function fillPercent(used: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(100, Math.round((used / budget) * 100))
}

/** 从 localStorage 读上次填的预算；读不到就用默认的 180 分钟 */
function readStoredMinutes(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const minutes = saved === null ? null : parseMinutes(saved)
    return minutes === null ? String(DEFAULT_MINUTES) : String(minutes)
  } catch {
    return String(DEFAULT_MINUTES)
  }
}

/** 把输入框的字符串解析成分钟数；空、非数字、小于等于 0 都算「没填」→ null */
function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}
