// 今日队列 —— 主视图的主角
//
// 依据：PRD 5.1（视图一）+ F3（队列可视化）+ F5（可解释排序）+ 第七节（边界状态）。
//
// Day 7 已经做到的：排序**不需要用户按按钮**，数据一变队列自己重算、自己重排。
// Day 8 补的是「看得见」的部分：
//   · 卡片化 —— 每件任务是一张卡片，排第一的那张明显突出；
//   · 点开解释 —— 点卡片展开三因子明细，让人看清分数是怎么来的（F5）；
//   · 四种状态 —— 加载中 / 成功 / 空 / 错误，四种都有对应的界面，不留白屏。
//
// ⚠️ 这个文件不碰 IndexedDB，只认 data/ 出口的接口；算分全走 core/。
//   读库与写操作都从 useTaskQueue 来 —— 预算条和数据面板用的是同一份状态。

import { useState } from 'react'
import { taskRepo } from '../data'
import type { QueueEntry } from '../core/priorityQueue'
import type { Task } from '../core/types'
import { formatMinutes } from './format'
import type { TaskQueue } from './useTaskQueue'

interface TodayQueueProps {
  queue: TaskQueue
  /** 外面传来的一句话提示（比如「已加入 XXX」），显示在队列上方 */
  notice: string
}

export function TodayQueue({ queue, notice }: TodayQueueProps) {
  const { ranked, done, total, loaded, busy, error, now, act, refresh, loadSamples } = queue

  // 哪张卡片被点开了。只允许开一张：同时展开多张会把队列读成一堆碎片。
  const [openId, setOpenId] = useState<string | null>(null)

  const handleComplete = (task: Task) =>
    act(() => taskRepo.completeTask(task.id), `完成「${task.title}」失败`)

  // 删除不可撤销（首版没有回收站），所以先确认一下再动手。
  const handleDelete = (task: Task) => {
    if (!window.confirm(`删除「${task.title}」？这一步不能撤销。`)) return
    return act(() => taskRepo.deleteTask(task.id), `删除「${task.title}」失败`)
  }

  // ---------- 状态一：错误 ----------
  if (error !== '') {
    return (
      <section className="card">
        <h2>今日队列</h2>
        <div className="state state-error">
          <p className="state-title">队列没读出来</p>
          <p className="state-sub">{error}</p>
          <button type="button" className="state-action" onClick={() => void refresh()}>
            重试
          </button>
        </div>
      </section>
    )
  }

  // ---------- 状态二：加载中 ----------
  if (!loaded) {
    return (
      <section className="card">
        <h2>今日队列</h2>
        <div className="state state-loading">
          <span className="spinner" aria-hidden="true" />
          <p className="state-title">正在读取…</p>
          <p className="state-sub">正在从这台设备的浏览器里读任务。</p>
        </div>
      </section>
    )
  }

  // ---------- 状态三：空 ----------
  if (ranked.length === 0) {
    return (
      <section className="card">
        <h2>今日队列</h2>
        <div className="state state-empty">
          {total === 0 ? (
            <>
              <p className="state-title">队列是空的</p>
              <p className="state-sub">
                在上面加一条任务，它会被自动算出该排第几。想先看看效果，也可以直接载入一份示例。
              </p>
              <button
                type="button"
                className="state-action"
                onClick={() => void loadSamples()}
                disabled={busy}
              >
                载入示例数据
              </button>
            </>
          ) : (
            <>
              <p className="state-title">待办清空了</p>
              <p className="state-sub">已完成 {total} 件。再加一条新任务，队列会立刻重新排。</p>
            </>
          )}
        </div>

        {done.length > 0 && (
          <p className="done-line">已完成：{done.map((task) => task.title).join('、')}</p>
        )}
      </section>
    )
  }

  // ---------- 状态四：成功 ----------
  return (
    <section className="card">
      <h2>今日队列</h2>

      <p className="queue-head">
        共 <strong>{ranked.length}</strong> 件待办
        {notice !== '' && <span className="queue-notice">· {notice}</span>}
      </p>

      <ol className="queue">
        {ranked.map((entry, index) => {
          const open = openId === entry.task.id
          const overdue = isOverdue(entry.task, now)

          return (
            <li
              key={entry.task.id}
              className={[
                'queue-card',
                entry.priority.isUrgent ? 'is-urgent' : 'not-urgent',
                overdue ? 'is-overdue' : '',
                open ? 'is-open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* 卡片主体可点，点开看「为什么排这里」。按钮在 .queue-actions 里，是它的兄弟节点，
                  所以点「完成」「删除」不会顺带展开卡片。 */}
              <div
                className="queue-body"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : entry.task.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setOpenId(open ? null : entry.task.id)
                  }
                }}
              >
                <div className="queue-line">
                  <span className="queue-no">{index + 1}</span>
                  <span className="queue-title">{entry.task.title}</span>
                  <span className="queue-score">{entry.priority.score.toFixed(1)}</span>
                </div>

                <p className="queue-why">
                  {entry.priority.reasons.map((reason) => reason.text).join(' · ')}
                </p>

                <div className="queue-meta">
                  {overdue && <span className="meta-overdue">已逾期</span>}
                  {entry.task.estimateMinutes !== null && (
                    <span>{formatMinutes(entry.task.estimateMinutes)}</span>
                  )}
                  <span>{entry.task.importance} 星</span>
                  <span>{describeSegment(entry, now)}</span>
                  <span className="queue-hint">{open ? '收起明细 ▴' : '为什么排这里 ▾'}</span>
                </div>

                {open && <FactorBreakdown entry={entry} />}
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
          )
        })}
      </ol>

      {done.length > 0 && (
        <p className="done-line">
          已完成 {done.length} 件：{done.map((task) => task.title).join('、')}
        </p>
      )}
    </section>
  )
}

/**
 * 三因子明细 —— F5「可解释排序」真正落地的地方。
 *
 * 光有一句理由（「还剩 9 小时 · 重要度 4 星」）只能说明**哪些项在起作用**，
 * 说不出各项**各占多少**。这里把三个因子各自的贡献分摆出来，
 * 分数就不再是一个黑箱数字，而是一笔能对得上的账。
 */
function FactorBreakdown({ entry }: { entry: QueueEntry }) {
  const factors = entry.priority.factors
  const rows = [factors.urgency, factors.importance, factors.quickWin]

  return (
    <div className="factors">
      {rows.map((factor) => (
        <div className="factor" key={factor.label}>
          <span className="factor-label">{factor.label}</span>
          <span className="factor-bar">
            <span
              className="factor-bar-fill"
              style={{ width: `${Math.round(factor.value * 100)}%` }}
            />
          </span>
          <span className="factor-points">{factor.points.toFixed(1)} 分</span>
        </div>
      ))}
      <p className="factor-note">
        总分 {entry.priority.score.toFixed(1)} = 40%×紧迫度 + 40%×重要度 + 20%×省时度
      </p>
    </div>
  )
}

/** 已经过了截止时间（含正好到点） */
function isOverdue(task: Task, now: Date): boolean {
  if (task.dueAt === null) return false
  const due = new Date(task.dueAt)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() <= now.getTime()
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
