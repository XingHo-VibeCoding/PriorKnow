// 今日预算条 —— PRD 5.1 视图一顶部的「今天还剩多少时间」
//
// 它回答一个具体问题：**按队列顺序做下去，今天大概能做几件。**
// 这件事只有「队列顺序」和「每件的耗时」凑在一起才算得出来 ——
// 所以预算条必须拿到算好分的队列，这也是它和队列共用 useTaskQueue 的原因。
//
// ⚠️ 预算**不参与优先级算分**。分数回答「该不该先做」，预算回答「今天做不做得完」，
// 是两件事，混在一起会让分数变得不可解释（也违反 PRD F2「分数只由三因子决定」）。

import { useEffect, useMemo, useRef, useState } from 'react'
import type { QueueEntry } from '../core/priorityQueue'
import { MAX_MINUTES, loadBudget, saveBudget, todayKey } from '../data/budget'
import { ErrorNote } from './ErrorNote'
import { explainError, type ExplainedError } from './errors'
import { formatMinutes } from './format'

/**
 * 「这笔预算现在是什么状态」—— 一个状态机，界面按它决定底下那行小字。
 *
 * 为什么单独一个状态而不是几个 boolean：
 *   「正在保存」和「已存到云端」不可能同时成立，用两个 boolean 就能组合出
 *   永远不该出现的状态（Day 23 的教训：状态能表达的东西，不要让界面去猜）。
 */
type SyncState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'cloud' }
  | { kind: 'local' }
  | { kind: 'failed'; error: ExplainedError }
  /** 超过 1440 分钟 —— 一天没有那么多分钟，这种数字不保存 */
  | { kind: 'too-big' }

interface TodayBudgetProps {
  /** 排好序的待办队列 */
  ranked: QueueEntry[]
  /** 队列读完了没有 —— 没读完时先不报「能做几件」，免得给出错的数 */
  loaded: boolean
}

export function TodayBudget({ ranked, loaded }: TodayBudgetProps) {
  // 今天（本地日历日）。预算是**按日期**存的，跨零点会换一格 —— 这里算一次就够，
  // 页面开着过夜的人下次刷新才会拿到新的一天（可接受，不值得为它加定时器）。
  const today = useMemo(() => todayKey(), [])

  // 输入框用字符串存，因为「空」是个有意义的状态（还没填），number 表达不了它
  const [raw, setRaw] = useState<string>('')
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' })

  // 防抖用。每敲一个数字就发一次请求既费流量也没意义，停手 700ms 再存。
  const timerRef = useRef<number | null>(null)
  const aliveRef = useRef(true)

  // 载入：本机缓存立刻可用，云端是加分项（读失败也要让预算条照常能用）
  useEffect(() => {
    aliveRef.current = true
    void (async () => {
      const result = await loadBudget(today)
      if (!aliveRef.current) return
      setRaw(result.minutes === null ? '' : String(result.minutes))
      if (result.cloudError !== null) {
        setSync({
          kind: 'failed',
          error: explainError(result.cloudError, '预算没能从云端读出来（用的是这台设备上次填的）'),
        })
      } else if (result.source === 'cloud') {
        setSync({ kind: 'cloud' })
      } else if (result.source === 'local') {
        setSync({ kind: 'local' })
      } else {
        setSync({ kind: 'idle' })
      }
    })()
    return () => {
      aliveRef.current = false
    }
  }, [today])

  // 走的时候把还没到点的防抖取消掉，否则会对着已卸载的组件 setState
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  /** 真正落盘：本机先写（同步成功），再推云端（可能失败） */
  async function persist(minutes: number | null) {
    if (!aliveRef.current) return
    setSync({ kind: 'saving' })
    const result = await saveBudget(today, minutes)
    if (!aliveRef.current) return
    if (result.cloudError !== null) {
      setSync({
        kind: 'failed',
        error: explainError(result.cloudError, '预算没能存到云端（这台设备上已经记下了）'),
      })
    } else {
      setSync({ kind: result.synced ? 'cloud' : 'local' })
    }
  }

  function handleChange(next: string) {
    setRaw(next)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)

    const minutes = parseMinutes(next)
    // 超一天的输入不保存，但要当场说清为什么（不是静默丢掉）
    if (minutes !== null && minutes > MAX_MINUTES) {
      setSync({ kind: 'too-big' })
      return
    }
    timerRef.current = window.setTimeout(() => {
      void persist(minutes)
    }, 700)
  }

  /** 空状态里的快捷按钮：点一下立刻填、立刻存，不走防抖 */
  function applyQuick(minutes: number) {
    setRaw(String(minutes))
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    void persist(minutes)
  }

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
            // ⚠️ 占位符不能写「分钟」—— 右边已经有一个「分钟」单位了，
            //    原来这里就是「[分钟] 分钟」并排，看着像 bug。
            placeholder="例如 180"
            value={raw}
            onChange={(event) => handleChange(event.target.value)}
            aria-label="今日可用时间（分钟）"
            aria-describedby="budget-sync"
          />
          <span className="budget-unit">分钟</span>
          {minutes !== null && <span className="budget-approx">≈ {formatMinutes(minutes)}</span>}
        </div>
      </div>

      {/* 存到哪儿了 —— 用户有权知道自己填的数是只在本机，还是已经上了云 */}
      <p id="budget-sync" className="budget-sync">
        {sync.kind === 'saving' && '正在保存…'}
        {sync.kind === 'cloud' && '已存到云端 · 换台设备也看得到'}
        {sync.kind === 'local' &&
          '只存在这台设备 —— 在「数据与设置」里填了接口地址，就能跟着账号走'}
        {sync.kind === 'too-big' && `一天只有 ${MAX_MINUTES} 分钟，这个数字没有保存`}
      </p>
      {sync.kind === 'failed' && (
        <ErrorNote error={sync.error} className="status status-bad budget-sync-error" />
      )}

      {/* 空状态：还没填就主动问一句，并给几个一眼能点的常见值 ——
          比让人对着一个空输入框自己想「该填多少」要好。 */}
      {minutes === null && loaded && ranked.length > 0 && (
        <div className="budget-prompt">
          {/* 标题不能照抄上面那行标签（「今天还剩多少时间」）——
              重复两遍同一句话，等于两块地方都没说出有用的东西。 */}
          <p className="budget-prompt-title">先告诉我今天大概还剩多少时间</p>
          <p className="budget-prompt-sub">
            估个大概就行，我按队列顺序算今天做得完几件。
          </p>
          <div className="budget-chips">
            {[60, 120, 180, 240].map((preset) => (
              <button
                key={preset}
                type="button"
                className="budget-chip"
                onClick={() => applyQuick(preset)}
              >
                {formatMinutes(preset)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="budget-note">正在读取队列…</p>
      ) : ranked.length === 0 ? (
        <p className="budget-note">队列还是空的 —— 先加一件任务，这里就能算出今天做得完几件。</p>
      ) : minutes === null ? (
        // 还没填：上面那条 budget-prompt 已经把话说了，这里不再重复一遍。
        // 只留一句「队列一共多少、合计多少」的客观信息，帮他想填多少。
        <p className="budget-note">
          队列共 <strong>{ranked.length}</strong> 件，其中能估耗时的 {plan.estimated} 件合计{' '}
          {formatMinutes(plan.used)}。
        </p>
      ) : notEnough && plan.shortest !== null ? (
        // 分支一：连队列里**最小**的一件都装不下 —— 今天是真的什么都做不了
        <div className="budget-warn">
          <p className="budget-warn-title">今天的时间不够完成任何一项</p>
          <p className="budget-warn-sub">
            队列里最省时的「{plan.shortest.title}」也要 {plan.shortest.minutes} 分钟，而今天只剩{' '}
            {minutes} 分钟。两条出路：① 把上面的预算改大一点；② 先只挑这一件小的做 ——
            下面的队列照常显示全部任务，不受影响。
          </p>
        </div>
      ) : plan.count === 0 && plan.blocker !== null && plan.shortest !== null ? (
        // 分支二：队首太大，但今天**够**做完队列里更小的那件。
        // 这不是「时间不够」，是「排在最前的那件太大」—— 结论完全不同，所以不能共用上一段的说法。
        <div className="budget-warn">
          <p className="budget-warn-title">排在最前的那件，今天装不下</p>
          <p className="budget-warn-sub">
            第一件「{plan.blocker.title}」要 {plan.blocker.minutes} 分钟，而今天只剩 {minutes}{' '}
            分钟。今天够做完最小的一件是「{plan.shortest.title}」，{plan.shortest.minutes}{' '}
            分钟 —— 要么先做它，要么把预算改大。
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
  /** **全队列**最省时的那一项（与预算无关，用来回答「今天到底够做什么」） */
  shortest: MinutesRef | null
  /** 按队列顺序第一件就装不下的那一项（预算够最小件、但队首太大时用） */
  blocker: MinutesRef | null
}

/**
 * 按队列顺序累加耗时，算出今天装得下几件。
 *
 * 规则是**顺序累加、装不下就停**，不做「跳过大的挑小的」这种优化。
 * 理由：队列顺序本身就是「该先做什么」的答案；跳过第一件去捡第三件，
 * 等于用预算把排序结果推翻了 —— 那预算就变成第二个排序器了。
 * 真遇到第一件装不下，界面会把这件事说出来（见下面的两个分支），让用户自己决定。
 *
 * ⚠️ 这里必须**扫两遍**，不能合成一遍。
 *   `shortest` 要回答的是「队列里最小的一件要多久」，这个数与预算无关；
 *   而累加循环一遇到装不下就 `break`，扫到那时为止的「最小值」只是「队首」。
 *   合成一遍的后果实测过：预算 60 分钟、队首 120 分钟时，界面会说
 *   「队列里最省时的『交课设』也要 120 分钟」，可队列里明明有一件 20 分钟的 ——
 *   一句话里两个事实都是假的。
 */
function planToday(ranked: QueueEntry[], budget: number | null): TodayPlan {
  // 第一遍：只看耗时这一维，与预算无关
  let unknown = 0
  let estimated = 0
  let shortest: MinutesRef | null = null

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
  }

  // 第二遍：按队列顺序累加，装不下就停
  let count = 0
  let used = 0
  let blocker: MinutesRef | null = null

  for (const entry of ranked) {
    const minutes = entry.task.estimateMinutes
    if (minutes === null) continue

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

/**
 * 把输入框的字符串解析成分钟数；空、非数字、小于等于 0 都算「没填」→ null
 *
 * ⚠️ 追加需求起**不再预填 180**：预算按日期存在云端，没填就是没填。
 *    预填一个假数字会让「空状态提示」永远不出现，也会把 180 悄悄写进用户的账户里。
 */
function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}
