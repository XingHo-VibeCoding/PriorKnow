// 错误提示的统一排版 —— Day 23
//
// 一句话 + 一个小标签：「网络问题」+「连不上接口：确认地址正确…」。
//
// 为什么标签值得占一个位置：
//   三类错误的**修法**是三件事 —— 改输入、查网络、看服务器说了什么。
//   标签让用户在两秒内知道该往哪儿看，而正文不必为此重复一遍
//   「这是输入问题，你需要…」。
//
// 为什么这里只做排版、不做分类：
//   分类是有判断的逻辑（见 errors.ts），排版是纯展示。
//   混在一起的话，想复用排版就得连判断一起带走，
//   而 CloudSyncPanel 那种已经 catch 过 SyncError 的地方不需要再判断一次。

import type { ExplainedError } from './errors'

interface ErrorNoteProps {
  error: ExplainedError
  /**
   * 借用调用处已有的容器样式（`.composer-error` / `.status status-bad` / `.state-sub`）。
   * 不传就用 `.error-note` 自己的那套。
   */
  className?: string
}

export function ErrorNote({ error, className = 'error-note' }: ErrorNoteProps) {
  return (
    <p className={className}>
      <span className={`error-tag error-tag-${error.kind}`}>{error.label}</span>
      <span className="error-text">{error.text}</span>
    </p>
  )
}
