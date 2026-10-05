// 知先 PriorKnow —— 界面外壳
//
// Day 8 进入第 2 周：主视图成型。
//
// Day 13 起这个文件**只负责外壳**：页头 / 导航 / 路由出口 / 状态开关 / 页脚 / 提示条。
// 三个视图的内容搬去了各自的页面组件（TodayPage / TasksPage / TaskDetailPage）——
// 在此之前它们全摊在这个文件里，那时项目只有一个视图，摊着无所谓。
//
// 队列的数据与写操作仍然统一由 useTaskQueue 提供，**在这里调用一次**，
// 三个视图共用同一份状态 —— 所以切换视图不会重新读库，队列也不会闪一下。
//
// Day 11：提示条挂在这一层，而不是挂进队列里。
// 原因见 ActionToast 的注释 —— 简单说，点掉最后一件任务时队列会整块换成空状态，
// 提示条跟着一起卸载的话，用户就丢了唯一的撤销机会。
// Day 13 之后这条理由更强了：切换视图时队列组件会卸载重建，
// 提示条必须活在外壳里，否则一换页提示就没了。

import { useCallback, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ActionToast } from './ui/ActionToast'
import { AppNav } from './ui/AppNav'
import { DevStateSwitch } from './ui/DevStateSwitch'
import { NotFoundPage } from './ui/NotFoundPage'
import { TaskDetailPage } from './ui/TaskDetailPage'
import { TasksPage } from './ui/TasksPage'
import { TodayPage } from './ui/TodayPage'
import { useTaskQueue, type DataMode } from './ui/useTaskQueue'

export function App() {
  // 给用户看的一句话提示，例如「已加入「读一遍 PRD」，队列已重排」。
  const [notice, setNotice] = useState('')

  // 数据层的演示模式：正常 / 慢速 / 读取失败 / 写入失败。
  // 平时是「正常」；切成慢速或失败，是为了让「加载中」和「错误」两种状态能被看见 ——
  // 本地库读一次只要几毫秒，这两种状态否则永远没人见过。
  // Day 13：状态仍然由 App 持有（三个视图共用同一份），但开关本身搬到了外壳上（见 DevStateSwitch）。
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
          {/* Day 9 修复⑦：原来整页一个 h1 都没有，「知先」只是个 span。
              设计规则要求「每个页面只有一个主标题」—— 语义上缺了主标题，
              读屏软件和搜索引擎都不知道这一页在讲什么。
              改成 h1 后视觉完全不变（.brand 的 44px 字号照旧），
              只是把「这是主标题」这件事补回去。 */}
          <h1 className="brand">知先</h1>
          <span className="brand-en">PriorKnow</span>
        </div>
        <p className="tagline">下一步做什么，让队列告诉你。</p>
        <p className="sub">把一堆散乱的任务丢进来，它算出先做哪件，并告诉你为什么。</p>
        <div className="badge">Day 13 · 三个视图 · 四种状态</div>
      </header>

      {/* 视图切换入口。放在页头下方 —— 先认地方，再看内容。 */}
      <AppNav />

      {/* 路由出口：地址栏决定这里是哪一个视图 */}
      <Routes>
        <Route
          path="/"
          element={<TodayPage queue={queue} notice={notice} onCreated={handleCreated} />}
        />
        <Route
          path="/tasks"
          element={<TasksPage queue={queue} notice={notice} onCreated={handleCreated} />}
        />
        <Route path="/tasks/:id" element={<TaskDetailPage queue={queue} />} />
        {/* 兜底：地址打错时不该看到白屏 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {/* 数据层状态开关（开发用）。Day 13 从「数据与设置」搬到这里，
          好让三个视图都能在同一位置随时切、随时看四种状态。 */}
      <DevStateSwitch dataMode={dataMode} onDataModeChange={setDataMode} />

      <footer className="foot">知先 PriorKnow · Next Action Scheduler</footer>

      {/* 操作反馈提示条。平时不占位（feedback 为 null 时整块不渲染）。 */}
      <ActionToast
        feedback={queue.feedback}
        busy={queue.busy}
        onUndo={queue.undoComplete}
        onRetry={queue.retryFeedback}
        onDismiss={queue.dismissFeedback}
      />
    </div>
  )
}
