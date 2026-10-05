// 视图二：全部任务（路径 `/tasks`）
//
// ⚠️ Day 14 改过。这一页原来是「换了排版的今日队列」—— 同一个queue.ranked、
//    同样的卡片顺序，区别只有已完成多一个分组。同伴测试时一句话点破：
//    「今日任务会显示所有任务，而且全部任务里面没有看到有独特的功能」。
//    → 所以这一页改成**管理视角**，与今日队列彻底分工：
//
//        今日队列  = 按**优先级**排，回答「我现在该先做哪一件」（只列没做完的）
//        全部任务  = 按**添加时间**排，回答「我手上总共有哪些事」（待办 + 已完成）
//
//    判断依据：这两页本就不该用同一个顺序。若管理页也按优先级排，
//    它就退化成队列的另一个皮肤，用户没有理由留在这一页。
//
// 四种状态这一页全都有：加载中 / 错误 / 空（一条任务都没有）/ 成功（两组列表）。
// 「空」的判断用 total（含已完成）而不是 ranked.length —— 一件事全做完时，
// 这一页不该显示「一条任务都没有」，那是「今日队列」才该有的说法。

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { taskRepo } from '../data'
import { DataPanel } from './DataPanel'
import { TaskComposer } from './TaskComposer'
import type { TaskQueue } from './useTaskQueue'

interface TasksPageProps {
  queue: TaskQueue
  /** 加任务后的一句话提示 */
  notice: string
  /** 加任务成功后：让队列重读（触发自动重排） */
  onCreated: (note: string) => void
}

export function TasksPage({ queue, notice, onCreated }: TasksPageProps) {
  const { ranked, done, total, loaded, error, busy, busyTaskId, refresh, loadSamples, act, completeTask } =
    queue

  /**
   * 待办按**添加时间倒序**排（最新的在最上面），顺带记下它在队列里的名次。
   *
   * 用useMemo 是因为这是一个派生值：queue 每次重读都会给出新的 ranked 数组，
   * 不缓存的话每次渲染都要重排一遍（功能上没问题，但白做功）。
   *
   * ⚠️ 刻意**不**按优先级排 —— 理由见文件头。这一页存在的意义就是
   * 「不按优先级看这件事」，排了序就废了这一页。
   *
   * 「队列第 N 位」这个标签是故意留的：它不表示本页顺序，而是回答
   * 「这件事在队列里排第几」，让人不必切回队列页去对。
   * 名次按 ranked 的下标算 —— ranked 本身就是优先级序，下标即名次。
   *
   * 排序键用 createdAt（同秒创建的用 id 兜底），因为 createdAt 是 ISO 字符串，
   * 直接字符串比较即等价于时间比较。
   */
  const byCreated = useMemo(
    () =>
      ranked
        .map((entry, index) => ({ ...entry, queueRank: index + 1 }))
        .sort((a, b) => {
          if (a.task.createdAt === b.task.createdAt) return a.task.id.localeCompare(b.task.id)
          return b.task.createdAt.localeCompare(a.task.createdAt)
        }),
    [ranked],
  )

  /** 恢复为待办 —— 与详情页同一个动作（数据层 updateTask），不新增逻辑 */
  async function handleRestore(id: string, title: string) {
    await act(() => taskRepo.updateTask(id, { status: 'todo' }), `恢复「${title}」失败`)
  }

  return (
    <>
      <section className="card">
        <h2>加任务</h2>
        <TaskComposer onCreated={onCreated} />
      </section>

      <section className="card">
        <h2>全部任务</h2>

        {/* Day 14：把这一页的用途讲出来。同伴分不清两个视图，
            根源不是标签字面意思像，而是「没说清各自回答什么问题」。
            队列页回答「先做哪件」，这一页回答「我一共欠了多少事」。 */}
        <p className="list-note">
          这一页是<strong>清单视角</strong>：按你添加的先后排列，不看优先级。
          想知道「现在该先做哪件」，回今日队列。
        </p>

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
              待办 <strong>{ranked.length}</strong> 件 · 按添加时间排列
            </p>
            {ranked.length === 0 ? (
              <p className="list-note">待办都做完了。再加一条，它会自动排进今日队列。</p>
            ) : (
              <ul className="task-list">
                {byCreated.map(({ task, queueRank, priority }) => {
                  const pending = busyTaskId === task.id
                  return (
                    <li key={task.id} className="task-item">
                      {/* 标题进详情页；按钮组独立，不套在Link 里 —— 避免嵌套交互元素 */}
                      <Link className="task-row" to={`/tasks/${task.id}`}>
                        <span className="task-row-title">{task.title}</span>
                        <span className="task-row-tag">队列第 {queueRank} 位</span>
                        <span className="task-row-score">{priority.score.toFixed(1)}</span>
                      </Link>
                      {/* Day 14 新增：行内操作。队列页的按钮藏在卡片里、要点开卡片才看见，
                          管理页要的是「一眼看到全部、就地处理」，所以按钮直接摊在行上。 */}
                      <div className="task-inline">
                        <button
                          type="button"
                          onClick={() => void completeTask(task.id, task.title)}
                          disabled={busy}
                        >
                          {pending ? '处理中…' : '完成'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            if (window.confirm(`删除「${task.title}」？这一步不能撤销。`)) {
                              void act(
                                () => taskRepo.deleteTask(task.id),
                                `删除「${task.title}」失败`,
                              )
                            }
                          }}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {done.length > 0 && (
              <>
                <p className="list-head">
                  已完成 <strong>{done.length}</strong> 件
                </p>
                <ul className="task-list">
                  {done.map((task) => (
                    <li key={task.id} className="task-item">
                      <Link className="task-row is-done" to={`/tasks/${task.id}`}>
                        <span className="task-row-title">{task.title}</span>
                        <span className="task-row-tag">已完成</span>
                      </Link>
                      {/* 恢复也在行上：管理页的意义就是「在这里改状态」，
                          不必为了恢复一件事专门进详情页。 */}
                      <div className="task-inline">
                        <button
                          type="button"
                          onClick={() => void handleRestore(task.id, task.title)}
                          disabled={busy}
                        >
                          恢复为待办
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <DataPanel queue={queue} />
    </>
  )
}