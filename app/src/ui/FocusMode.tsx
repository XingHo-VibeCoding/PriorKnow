// 专注模式 —— PRD 的 F7
//
// 依据：PRD 3.1 F7 的三条可观察结果（第 104–110 行）：
//   ① 在队首任务上点「开始专注」→ 进入只剩一张卡片的界面 + 一个倒计时
//   ② 倒计时结束有明确提示
//   ③ 在专注模式里点「完成」→ 当前任务消失，**下一个自动浮上来**，不用回列表手动挑
//
// 为什么用全屏覆盖层，而不是一条 `/focus` 路由：
//   · 专注要的是「只剩这一件」，地址栏、导航、页脚都该消失 —— 覆盖层天然做到；
//   · 静态托管目前**没有 History 回退**（刷新 `/tasks` 会 404，尚未修），
//     再加一条路由等于再加一个「刷新就白屏」的入口；
//   · 退出走按钮 / Esc，不需要浏览器返回键。
//   代价：不能分享链接、刷新会掉出专注模式。对一个「此刻只做这一件」的功能，可以接受。
//
// 🔴 一个关键设计：**专注模式不记住是哪一条，它永远盯着 `ranked[0]`。**
//    「完成 → 下一个浮上来」因此不需要任何额外代码：点完成 → 队列重读 → 队首换了
//    → 这里的 task 跟着换 → 倒计时自动重置。若把 id 记下来，就得手写「完成后找下一条」，
//    还多一个「那条被别处改了/删了」的分支要处理。

import { useEffect, useRef, useState } from 'react'
import type { TaskQueue } from './useTaskQueue'

interface FocusModeProps {
  queue: TaskQueue
  onExit: () => void
}

/** 任务没填预计耗时时的默认时长（分钟）。25 是番茄钟的标准值，用户有心理预期 */
const DEFAULT_MINUTES = 25

/** 时间到之后「再来一会儿」加多少分钟 */
const EXTEND_MINUTES = 5

export function FocusMode({ queue, onExit }: FocusModeProps) {
  const { ranked, busy, busyTaskId, completeTask, feedback } = queue

  // 队首就是这一次要专注的那一件 —— 见文件头「永远盯着 ranked[0]」
  const entry = ranked[0]
  const task = entry?.task

  const plannedSeconds = (task?.estimateMinutes ?? DEFAULT_MINUTES) * 60

  const [remaining, setRemaining] = useState(plannedSeconds)
  // 这一轮计时的「起点秒数」。它和 remaining 一起重置 —— 进度条要用它算比例。
  // ⚠️ 不能直接用 plannedSeconds 算进度：用户点「再 +5 分钟」时，
  //    plannedSeconds 是不变的，进度条会从 0% 猛地跳成 80%，看着像出错了。
  const [total, setTotal] = useState(plannedSeconds)
  const [running, setRunning] = useState(true)

  // 换了一条任务（包括「刚完成一件、下一条浮上来」）就重置计时。
  // ⚠️ 依赖里放 task?.id 而不是整个 task：队列每次重读都会给出新对象，
  //    依赖对象会导致「每秒重置一次」这种灾难。
  useEffect(() => {
    setRemaining(plannedSeconds)
    setTotal(plannedSeconds)
    setRunning(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  // 计时本体。只依赖 [running, task?.id]：若把 remaining 也放进来，
  // 每减一秒都会拆掉重设一次 interval，误差会累积。
  useEffect(() => {
    if (!running || task === undefined) return
    const timer = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, task])

  // 归零就自己停下，别再空转
  useEffect(() => {
    if (remaining === 0) setRunning(false)
  }, [remaining])

  // 打开期间锁住背景滚动 —— 否则滚轮一动，下面那页会跟着滑，很出戏
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Esc 退出 + 进入时把焦点收进来（读屏软件得知道现在换了一层）
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('keydown', handleKey)
      before?.focus?.()
    }
  }, [onExit])

  async function handleDone() {
    if (task === undefined) return
    await completeTask(task.id, task.title)
  }

  // ---------- 队首不存在 ----------
  // 三种情况都会走到这里，必须分开说 —— 这个项目从 Day 8 起就要求
  // 「加载中 / 错误 / 空」各自有各自的样子，专注模式不能退化成一句「队列清空了」。
  if (task === undefined) {
    const loading = !queue.loaded
    const failed = queue.error !== ''

    return (
      <div className="focus-layer" role="dialog" aria-modal="true" aria-label="专注模式">
        <div className="focus-panel" ref={panelRef} tabIndex={-1}>
          <p className="focus-eyebrow">专注模式</p>
          <h2 className="focus-empty">
            {loading ? '正在读取…' : failed ? '队列没读出来' : '队列清空了'}
          </h2>
          <p className="focus-sub">
            {loading
              ? '正在从这台设备的浏览器里读任务。'
              : failed
                ? queue.error
                : queue.done.length > 0
                  ? `今天已经完成 ${queue.done.length} 件。不想关屏幕就去休息一下，或者再加一条。`
                  : '还没有待办任务。先加一条，再回来专注。'}
          </p>
          <button type="button" className="focus-primary" onClick={onExit}>
            退出专注
          </button>
        </div>
      </div>
    )
  }

  const overdue = remaining === 0
  const progress = total === 0 ? 1 : 1 - remaining / total

  return (
    <div className="focus-layer" role="dialog" aria-modal="true" aria-label="专注模式">
      <div className="focus-panel" ref={panelRef} tabIndex={-1}>
        <p className="focus-eyebrow">
          专注模式
          <span className="focus-hint">Esc 退出</span>
        </p>

        {/* 倒计时。到 0 之后数字与文案一起变成「时间到」，这是 PRD 要的「明确提示」。 */}
        <p className={overdue ? 'focus-clock is-over' : 'focus-clock'} aria-live="polite">
          {formatClock(remaining)}
        </p>

        <div className="focus-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
        </div>

        <p className="focus-note">
          {overdue
            ? '时间到了。没做完就再加 5 分钟，做完了就点完成。'
            : task.estimateMinutes === null
              ? `这条没填预计耗时，先按 ${DEFAULT_MINUTES} 分钟算。`
              : '按这条任务的预计耗时算的'}
        </p>

        {/* 只剩这一张卡 —— 标题 + 为什么是它。理由必须留着：
            这个项目的全部价值就是「告诉你为什么先做这件」，专注模式不能把它丢掉。 */}
        <div className="focus-task">
          <h2 className="focus-title">{task.title}</h2>
          <p className="focus-why">
            {entry.priority.reasons.map((reason) => reason.text).join(' · ')}
          </p>
          <p className="focus-score">优先级 {entry.priority.score.toFixed(1)} 分</p>
        </div>

        {/* 失败必须当场说清楚：这里的提示条被覆盖层挡着，用户看不见 */}
        {feedback !== null && feedback.kind === 'failed' && (
          <p className="focus-error">这一件没完成：{feedback.detail}。可以再点一次完成。</p>
        )}

        <div className="focus-actions">
          <button
            type="button"
            className="focus-primary"
            onClick={() => void handleDone()}
            disabled={busy}
          >
            {busyTaskId === task.id ? '处理中…' : '完成这一件'}
          </button>

          {overdue ? (
            <button
              type="button"
              className="focus-secondary"
              onClick={() => {
                setTotal(EXTEND_MINUTES * 60)
                setRemaining(EXTEND_MINUTES * 60)
                setRunning(true)
              }}
            >
              再 +{EXTEND_MINUTES} 分钟
            </button>
          ) : (
            <button
              type="button"
              className="focus-secondary"
              onClick={() => setRunning((value) => !value)}
            >
              {running ? '暂停' : '继续'}
            </button>
          )}

          <button type="button" className="focus-ghost" onClick={onExit}>
            退出专注
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 秒数 → 计时文本。
 *
 * 一小时以内是 `mm:ss`（「25:00」—— 一眼就知道还剩多少分钟）；
 * 超过一小时才换成 `h:mm:ss`（「2:00:00」）。
 * ⚠️ 一开始只写 mm:ss，结果一条 120 分钟的任务显示成「119:58」——
 *    数字对，但人要读两遍才反应过来是两小时。分界线放在 1 小时，按人怎么读来定。
 */
function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
