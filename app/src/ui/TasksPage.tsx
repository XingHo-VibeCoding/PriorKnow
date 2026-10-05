// 视图二：全部任务（路径 `/tasks`）
//
// 它回答的问题和「今日队列」不一样，这一点是这一页存在的理由：
//   今日队列 —— 我**现在**该做哪一件（只排没做完的，只给一个先后）
//   全部任务 —— 我手上**总共**有哪些事、哪些已经做完（管理视角，两边都列）
//
// 所以这一页把「待办」和「已完成」并列摆出来，每条都能点进详情。
//
// 四种状态这一页全都有：加载中 / 错误 / 空（一条任务都没有）/ 成功（两组列表）。
// 「空」的判断用 total（含已完成）而不是 ranked.length —— 一件事全做完时，
// 这一页不该显示「一条任务都没有」，那是「今日队列」才该有的说法。

import { Link } from 'react-router-dom'
import { DataPanel } from './DataPanel'
import { TaskComposer } from './TaskComposer'
import type { TaskQueue } from './useTaskQueue'

interface TasksPageProps {
  queue: TaskQueue
  /** 加任务后的一句话提示 */
  notice: string
  /** 加任务成功后：给一句提示 + 让队列重读 */
  onCreated: (note: string) => void
}

export function TasksPage({ queue, notice, onCreated }: TasksPageProps) {
  const { ranked, done, total, loaded, error, busy, refresh, loadSamples } = queue

  return (
    <>
      <section className="card">
        <h2>加任务</h2>
        <TaskComposer onCreated={onCreated} />
      </section>

      <section className="card">
        <h2>全部任务</h2>

        {notice !== '' && <p className="list-note">{notice}</p>}

        {/* ---------- 状态一：错误 ---------- */}
        {error !== '' ? (
          <div className="state state-error">
            <p className="state-title">任务列表没读出来</p>
            <p className="state-sub">{error}</p>
            <button type="button" className="state-action" onClick={() => void refresh()}>
              重试
            </button>
          </div>
        ) : /* ---------- 状态二：加载中 ---------- */
        !loaded ? (
          <div className="state state-loading">
            <span className="spinner" aria-hidden="true" />
            <p className="state-title">正在读取…</p>
            <p className="state-sub">正在从这台设备的浏览器里读任务。</p>
          </div>
        ) : /* ---------- 状态三：空 ---------- */
        total === 0 ? (
          <div className="state state-empty">
            <p className="state-title">一条任务都没有</p>
            <p className="state-sub">在上面加一条，或者先载入一份示例数据看看效果。</p>
            <button
              type="button"
              className="state-action"
              onClick={() => void loadSamples()}
              disabled={busy}
            >
              载入示例数据
            </button>
          </div>
        ) : (
          /* ---------- 状态四：成功 ---------- */
          <>
            <p className="list-head">
              待办 <strong>{ranked.length}</strong> 件
            </p>
            {ranked.length === 0 ? (
              <p className="list-note">待办都做完了。再加一条，它会自动排进来。</p>
            ) : (
              <ol className="task-list">
                {ranked.map((entry) => (
                  <li key={entry.task.id}>
                    <Link className="task-row" to={`/tasks/${entry.task.id}`}>
                      <span className="task-row-title">{entry.task.title}</span>
                      <span className="task-row-score">{entry.priority.score.toFixed(1)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            {done.length > 0 && (
              <>
                <p className="list-head">
                  已完成 <strong>{done.length}</strong> 件
                </p>
                <ol className="task-list">
                  {done.map((task) => (
                    <li key={task.id}>
                      <Link className="task-row is-done" to={`/tasks/${task.id}`}>
                        <span className="task-row-title">{task.title}</span>
                        <span className="task-row-tag">已完成</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </section>

      <DataPanel queue={queue} />
    </>
  )
}
