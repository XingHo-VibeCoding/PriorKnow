// 今日队列 —— Day 7 第 4 步的主角，闭环的「算」与「回」
//
// 依据：PRD 5.1 视图一（今日队列）+ F1（增删改查）+ F2 + F3 + F5。
//
// 这一步的意义在于：排序**不再需要用户按按钮**。
// 只要数据变（新增 / 完成 / 删除），队列自己重算、自己重排 ——
// 这才叫「自动调度」，前面三步的算法和存储到这里才真正合成一个产品。
//
// ⚠️ 这个文件不碰 IndexedDB，只认 data/ 出口的接口；算分全走 core/。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { taskRepo } from '../data'
import { rankTasks, type QueueEntry } from '../core/priorityQueue'
import type { Task } from '../core/types'

interface TodayQueueProps {
  /** 外面传来的一句话提示（比如「已加入 XXX」），显示在状态栏 */
  notice: string
  /**
   * 数据版本号。每次外部写入（比如加任务）就自增一次，用来触发重新读库。
   *
   * 为什么不直接依赖 notice：连着加两条同名任务时提示文案相同、state 不变，
   * 队列不会刷新 —— 数据变了界面却不动。自增数字每次都不同，所以更可靠。
   */
  dataVersion: number
}

export function TodayQueue({ notice, dataVersion }: TodayQueueProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 这一次渲染用的「现在」。所有排序都基于它，保证同一屏里的分数与顺序自洽。
  const [now, setNow] = useState(() => new Date())

  /** 读库 + 重置时刻。任何写操作之后都要调它，让队列跟着数据走。 */
  const refresh = useCallback(async () => {
    try {
      const list = await taskRepo.listTasks()
      setTasks(list)
      setNow(new Date())
      setError('')
    } catch (err) {
      setError('读取失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoaded(true)
    }
  }, [])

  // 首次挂载读一次；之后每次 dataVersion 变化（外部写了新数据）再读一次。
  useEffect(() => {
    void refresh()
  }, [refresh, dataVersion])

  // 待办任务：只排没做完的。已完成的不该占着「今天做什么」的位置。
  const pending = useMemo(() => tasks.filter((task) => task.status !== 'done'), [tasks])
  const done = useMemo(() => tasks.filter((task) => task.status === 'done'), [tasks])

  // 算分 + 排序。now 固定，所以这次渲染里分数与顺序是同一时刻的产物。
  const ranked = useMemo(() => rankTasks(pending, now), [pending, now])

  /** 统一包一层：写操作 → 重读 → 队列自动重排 */
  async function act(action: () => Promise<unknown>, failureNote: string) {
    setBusy(true)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(failureNote + '：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = (task: Task) =>
    act(() => taskRepo.completeTask(task.id), `完成「${task.title}」失败`)

  // 删除不可撤销（首版没有回收站），所以先确认一下再动手。
  const handleDelete = (task: Task) => {
    if (!window.confirm(`删除「${task.title}」？这一步不能撤销。`)) return
    return act(() => taskRepo.deleteTask(task.id), `删除「${task.title}」失败`)
  }

  if (!loaded) {
    return (
      <section className="card">
        <h2>今日队列</h2>
        <p className="status">正在读取…</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>今日队列</h2>

      {error !== '' && <p className="composer-error">{error}</p>}

      {ranked.length === 0 ? (
        // 空状态：给引导，不显示空框（PRD 第七节要求）
        <div className="empty">
          <p className="empty-title">队列是空的</p>
          <p className="empty-sub">在上面加一条任务，它会被自动算出该排第几。</p>
        </div>
      ) : (
        <>
          <p className="queue-head">
            共 <strong>{ranked.length}</strong> 件待办
            {notice !== '' && <span className="queue-notice">· {notice}</span>}
          </p>

          <ol className="queue">
            {ranked.map((entry, index) => (
              <li key={entry.task.id} className={entry.priority.isUrgent ? 'is-urgent' : 'not-urgent'}>
                <span className="queue-no">{index + 1}</span>

                <div className="queue-body">
                  <div className="queue-line">
                    <span className="queue-title">{entry.task.title}</span>
                    <span className="queue-score">{entry.priority.score.toFixed(1)}</span>
                  </div>

                  <p className="queue-why">
                    {entry.priority.reasons.map((reason) => reason.text).join(' · ')}
                  </p>

                  <div className="queue-meta">
                    {entry.task.estimateMinutes !== null && <span>{entry.task.estimateMinutes} 分钟</span>}
                    <span>{entry.task.importance} 星</span>
                    <span>{describeSegment(entry, now)}</span>
                  </div>
                </div>

                <div className="queue-actions">
                  <button
                    type="button"
                    onClick={() => handleComplete(entry.task)}
                    disabled={busy}
                    title="标记完成"
                  >
                    完成
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => handleDelete(entry.task)}
                    disabled={busy}
                    title="删除"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {done.length > 0 && (
        <p className="done-line">
          已完成 {done.length} 件：{done.map((task) => task.title).join('、')}
        </p>
      )}
    </section>
  )
}

/**
 * 说明这条为什么落在当前区段。
 *
 * 三种情况要分开讲，否则「有截止时间却排在后面」会让人以为算法坏了：
 *   · 紧急（已逾期或 7 天内到期）→ 被提前
 *   · 没填截止时间                → 无期限
 *   · 填了但还远                  → 期限还远，目前不算紧急
 *
 * @param now 本次排序用的时刻。必须与算分同一个 now，
 *            否则页面挂着不动几小时后，分数还是旧的、天数却变了。
 */
function describeSegment(entry: QueueEntry, now: Date): string {
  if (entry.priority.isUrgent) return '已逾期或 7 天内到期'

  if (entry.task.dueAt === null) return '无期限'

  const days = Math.max(
    0,
    Math.ceil((new Date(entry.task.dueAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  )
  return `期限还有 ${days} 天，暂不算紧急`
}
