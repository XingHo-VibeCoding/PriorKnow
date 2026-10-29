// 写操作失败的那一条提示 —— Day 24
//
// 为什么需要一个新的小组件，而不是继续用 ErrorNote：
//   ErrorNote 只负责「标签 + 一句话」的排版，它假设调用处**已经有一个容器**
//   （表单里的 .composer-error、整页错误态的 .status、数据面板的 .status）。
//   写失败这条提示没有这样的现成容器 —— 它要自己占一行、还要带一个「知道了」。
//
// 为什么它不叫 ErrorNote：它俩管的不是同一件事。
//   ErrorNote       = 一次失败长什么样（排版）
//   WriteErrorBar   = 一次**写**失败该出现在哪儿、怎么收起来（位置与生命周期）
//   分开之后，将来往 ErrorNote 里加东西不会顺带改掉这条提示的行为。
//
// 🔴 它放在**内容里**，不放在覆盖层上。理由和 ActionToast 相反：
//   提示条要浮起来是因为「点掉最后一件时队列会整块卸载」；
//   而写失败发生时，用户正盯着列表里那一件 —— 提示就该出现在那儿，
//   不必去抢焦，也不必盖住他正在看的东西。

import { ErrorNote } from './ErrorNote'
import type { ExplainedError } from './errors'

interface WriteErrorBarProps {
  error: ExplainedError | null
  onDismiss: () => void
}

export function WriteErrorBar({ error, onDismiss }: WriteErrorBarProps) {
  // 没有失败时整块不渲染，也就不会在页面上多占一行空白
  if (error === null) return null

  return (
    <div className="write-error">
      <ErrorNote error={error} className="status status-bad write-error-text" />
      <button type="button" className="write-error-close" onClick={onDismiss}>
        知道了
      </button>
    </div>
  )
}
