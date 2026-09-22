// 知先 PriorKnow —— 界面外壳
//
// Day 7 走到第 4 步（最后一步）：闭环合上了。
//   加任务 → 存进 IndexedDB → 算分 → 排队列 → 显示理由
// 前面三步的算法与数据层到这里第一次连成一条能用的链路。

import { useCallback, useState } from 'react'
import { TaskComposer } from './ui/TaskComposer'
import { TodayQueue } from './ui/TodayQueue'

// 数据流四环节。这是 Day 5 技术设计里定下的主干。
const DATA_FLOW = [
  { step: '来', layer: '界面层', what: '用户新建 / 完成一件任务' },
  { step: '算', layer: '业务层', what: '算优先级分数，重排队列' },
  { step: '存', layer: '数据层接口', what: '接口背后落到 IndexedDB' },
  { step: '回', layer: '界面层', what: '读回任务，重算，渲染今日队列' },
]

export function App() {
  // 给用户看的一句话提示，例如「已加入「读一遍 PRD」，队列已重排」。
  const [notice, setNotice] = useState('')

  // ⚠️ 队列靠这个数字决定「要不要重新读库」，而不是靠上面的提示文案。
  //
  // 为什么不用 notice 当信号：连着加两条同名任务时，提示文案一模一样、
  // state 不变，队列就不会刷新 —— 数据明明变了，界面却不动。
  // 自增数字每次都不同，所以任何一次写入都能触发重读。
  const [dataVersion, setDataVersion] = useState(0)

  const handleCreated = useCallback((note: string) => {
    setNotice(note)
    setDataVersion((version) => version + 1)
  }, [])

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <span className="brand">知先</span>
          <span className="brand-en">PriorKnow</span>
        </div>
        <p className="tagline">下一步做什么，让队列告诉你。</p>
        <p className="sub">
          把一堆散乱的任务丢进来，它算出先做哪件，并告诉你为什么。
        </p>
        <div className="badge">Day 7 · 第 4 步 · 今日队列已闭环</div>
      </header>

      <section className="card">
        <h2>数据怎么走</h2>
        <ul className="flow">
          {DATA_FLOW.map((item) => (
            <li key={item.step}>
              <span className="chip">{item.step}</span>
              <div className="flow-text">
                <strong>{item.layer}</strong>
                <span>{item.what}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>加任务</h2>
        <TaskComposer onCreated={handleCreated} />
      </section>

      <TodayQueue notice={notice} dataVersion={dataVersion} />

      <footer className="foot">知先 PriorKnow · Next Action Scheduler</footer>
    </div>
  )
}
