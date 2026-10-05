// 视图三：任务详情（路径 `/tasks/:id`）
//
// 为什么值得单独一个页面：本项目的主卖点是「**可解释的**自动排序」
// （research.md 的结论 —— 竞品都在「记录」层卷，没人回答「为什么是这件」）。
// 但「解释」此前只藏在队列卡片点开后的三因子明细里，那是附属信息。
// 给它一个独立页面，意味着「为什么排这里」可以被单独访问，也能把地址发给别人看。
//
// ⚠️ 这一页的「空」是**真的**：手输一个不存在的 id，就必然走到「找不到这件任务」。
//    它不是摆出来的空态，而是一条**可证伪**的路径 —— 这正是本项目一贯的口径
//    （「本地库上看不见的状态要主动造出来才能验收」）。
//
// 四种状态：加载中 / 错误 / 空（找不到）/ 成功。

import { Link, useNavigate, useParams } from 'react-router-dom'
import { taskRepo } from '../data'
import type { Task } from '../core/types'
import { formatMinutes } from './format'
import { FactorBreakdown, describeSegment } from './TodayQueue'
import type { TaskQueue } from './useTaskQueue'

interface TaskDetailPageProps {
  queue: TaskQueue
}

export function TaskDetailPage({ queue }: TaskDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { ranked, done, loaded, error, busy, busyTaskId, now, refresh, act, completeTask } = queue

  // ---------- 状态一：错误 ----------
  if (error !== '') {
    return (
      <section className="card">
        <h2>任务详情</h2>
        <div className="state state-error">
          <p className="state-title">这件任务没读出来</p>
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
        <h2>任务详情</h2>
        <div className="state state-loading">
          <span className="spinner" aria-hidden="true" />
          <p className="state-title">正在读取…</p>
          <p className="state-sub">正在从这台设备的浏览器里读这件任务。</p>
        </div>
      </section>
    )
  }

  // ⚠️ 两个列表都要找：任务一旦标记完成，它就从 ranked 挪到了 done。
  //    只查 ranked 的话，用户刚点完「完成」，这一页立刻变成「找不到这件任务」——
  //    看起来像数据丢了，其实只是换了一组。
  const found = ranked.find((item) => item.task.id === id)
  const finished = done.find((task) => task.id === id)

  // ---------- 状态三：空（找不到） ----------
  if (!found && !finished) {
    return (
      <section className="card">
        <h2>任务详情</h2>
        <div className="state state-empty">
          <p className="state-title">找不到这件任务</p>
          <p className="state-sub">
            地址里的编号是「{id}」，但库里没有对应的任务。它可能已经被删除了，
            也可能是地址打错了。
          </p>
          <Link className="state-action" to="/tasks">
            回全部任务
          </Link>
        </div>
      </section>
    )
  }

  // ---------- 状态四：成功 ----------
  const task: Task = found ? found.task : finished!
  const rank = found ? ranked.findIndex((item) => item.task.id === id) + 1 : null
  const pending = busyTaskId === task.id

  /** 删除。删完这一页就没有内容了（会变成「找不到」），所以主动退回列表页。 */
  async function handleDelete() {
    if (!window.confirm(`删除「${task.title}」？这一步不能撤销。`)) return
    const ok = await act(() => taskRepo.deleteTask(task.id), `删除「${task.title}」失败`)
    if (ok) navigate('/tasks')
  }

  /** 恢复为待办 —— 复用数据层现成的 updateTask，和队列里「撤销」是同一个动作。 */
  async function handleRestore() {
    await act(() => taskRepo.updateTask(task.id, { status: 'todo' }), `恢复「${task.title}」失败`)
  }

  return (
    <section className="card">
      <Link className="back-link" to="/tasks">
        ← 返回全部任务
      </Link>

      <h2 className="detail-title">{task.title}</h2>

      {found ? (
        <p className="detail-score-row">
          <span className="detail-score">{found.priority.score.toFixed(1)}</span>
          <span className="detail-score-unit">分</span>
          <span className="detail-rank">今日队列第 {rank} 位</span>
        </p>
      ) : (
        <p className="detail-score-row">
          <span className="detail-tag">已完成</span>
          <span className="detail-rank">不再占着「今天做什么」的位置</span>
        </p>
      )}

      {found && <FactorBreakdown entry={found} />}

      {found && (
        <div className="detail-block">
          <p className="detail-sub">为什么排这里</p>
          <ul className="reason-list">
            {found.priority.reasons.map((reason) => (
              <li key={reason.text}>{reason.text}</li>
            ))}
          </ul>
          <p className="detail-note">所在区段：{describeSegment(found, now)}</p>
        </div>
      )}

      <dl className="detail-meta">
        <div className="meta-pair">
          <dt>重要度</dt>
          <dd>{task.importance} 星</dd>
        </div>
        <div className="meta-pair">
          <dt>预计时长</dt>
          <dd>{task.estimateMinutes === null ? '未估算' : formatMinutes(task.estimateMinutes)}</dd>
        </div>
        <div className="meta-pair">
          <dt>截止时间</dt>
          <dd>{formatDue(task.dueAt, now)}</dd>
        </div>
        <div className="meta-pair">
          <dt>当前状态</dt>
          <dd>{task.status === 'done' ? '已完成' : '待办'}</dd>
        </div>
      </dl>

      <div className="btn-row">
        {found ? (
          <>
            <button
              type="button"
              onClick={() => void completeTask(task.id, task.title)}
              disabled={busy}
            >
              {pending ? '处理中…' : '标记完成'}
            </button>
            <button type="button" className="danger" onClick={() => void handleDelete()} disabled={busy}>
              删除
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void handleRestore()} disabled={busy}>
            恢复为待办
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * 把截止时间说成人话。
 *
 * 四种情况分开讲，否则「还剩 5 小时」和「已逾期 3 天」会糊成一句：
 *   · 没填      → 没有期限
 *   · 时间坏了  → 说明格式不对（导入的 JSON 可能是手改的）
 *   · 已过点    → 已逾期
 *   · 还没到    → 还剩 N 小时 / N 天
 *
 * @param now 本次渲染用的「现在」。必须和算分用同一个 now，
 *            否则页面挂着不动几小时后，这里的天数会和分数对不上。
 */
function formatDue(dueAt: string | null, now: Date): string {
  if (dueAt === null) return '没设截止时间'

  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return '时间格式不对'

  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${due.getMonth() + 1} 月 ${due.getDate()} 日 ${pad(due.getHours())}:${pad(due.getMinutes())}`

  const diffMs = due.getTime() - now.getTime()
  if (diffMs <= 0) return `已逾期 · ${stamp}`

  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  if (hours < 24) return `还剩 ${hours} 小时 · ${stamp}`

  return `还剩 ${Math.ceil(hours / 24)} 天 · ${stamp}`
}
