// 知先 PriorKnow —— 界面外壳
//
// Day 8 进入第 2 周：主视图成型。
//   今日预算条（今天做得完几件）→ 加任务 → 今日队列（卡片 + 解释）→ 数据与设置
//
// 队列的数据与写操作统一由 useTaskQueue 提供 —— 预算条、队列、数据面板
// 三个区块共享同一份状态，不再各自读一遍库。

import { useCallback, useState } from 'react'
import { TaskComposer } from './ui/TaskComposer'
import { TodayBudget } from './ui/TodayBudget'
import { TodayQueue } from './ui/TodayQueue'
import { DataPanel } from './ui/DataPanel'
import { useTaskQueue, type DataMode } from './ui/useTaskQueue'

export function App() {
  // 给用户看的一句话提示，例如「已加入「读一遍 PRD」，队列已重排」。
  const [notice, setNotice] = useState('')

  // 数据层的演示模式：正常 / 慢速 / 失败。
  // 平时是「正常」；切成慢速或失败，是为了让「加载中」和「错误」两种状态能被看见 ——
  // 本地库读一次只要几毫秒，这两种状态否则永远没人见过。
  const [dataMode, setDataMode] = useState<DataMode>('normal')

  const queue = useTaskQueue(dataMode)
  const { refresh } = queue

  // 加任务成功后：给一句提示 + 让队列重读。
  // 这次重读就是「自动重排」的触发点 —— 用户全程不需要点任何「排序」按钮。
  const handleCreated = useCallback(
    (note: string) => {
      setNotice(note)
      void refresh()
    },
    [refresh],
  )

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="brand">知先</span>
          <span className="brand-en">PriorKnow</span>
        </div>
        <p className="tagline">下一步做什么，让队列告诉你。</p>
        <p className="sub">把一堆散乱的任务丢进来，它算出先做哪件，并告诉你为什么。</p>
        <div className="badge">Day 8 · 主视图 · 四种状态齐备</div>
      </header>

      <TodayBudget ranked={queue.ranked} loaded={queue.loaded} />

      <section className="card">
        <h2>加任务</h2>
        <TaskComposer onCreated={handleCreated} />
      </section>

      <TodayQueue queue={queue} notice={notice} />

      <DataPanel queue={queue} dataMode={dataMode} onDataModeChange={setDataMode} />

      <footer className="foot">知先 PriorKnow · Next Action Scheduler</footer>
    </div>
  )
}
