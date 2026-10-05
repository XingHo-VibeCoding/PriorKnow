// 视图一：今日队列（路径 `/`）
//
// Day 13 之前，这三个区块直接摊在 App.tsx 里 —— 那时项目只有这一个视图。
// 拆成三个视图后，App 只留外壳（页头 / 导航 / 状态开关 / 页脚 / 提示条），
// 「我今天该做哪一件」这一屏归到这里。
//
// ⚠️ 内容是从 App.tsx **原样搬过来**的，行为一行没变：
//    预算条 + 加任务 + 今日队列（含 Day 12 的筛选交互）。
//    搬的时候最容易出的错是「顺手改点别的」—— 这里刻意什么都没动。

import { TaskComposer } from './TaskComposer'
import { TodayBudget } from './TodayBudget'
import { TodayQueue } from './TodayQueue'
import type { TaskQueue } from './useTaskQueue'

interface TodayPageProps {
  queue: TaskQueue
  /** 外面传来的一句话提示（例如「已加入「读一遍 PRD」，队列已重排」） */
  notice: string
  /** 加任务成功后：给一句提示 + 让队列重读（触发自动重排） */
  onCreated: (note: string) => void
}

export function TodayPage({ queue, notice, onCreated }: TodayPageProps) {
  return (
    <>
      <TodayBudget ranked={queue.ranked} loaded={queue.loaded} />

      <section className="card">
        <h2>加任务</h2>
        <TaskComposer onCreated={onCreated} />
      </section>

      <TodayQueue queue={queue} notice={notice} />
    </>
  )
}
