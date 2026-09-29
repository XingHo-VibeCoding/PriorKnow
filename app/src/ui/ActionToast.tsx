// 操作反馈提示条 —— Day 11 的主角
//
// 依据：课程 Day 11（计划第 891–957 行）「完成至少一个『用户操作后页面明确回应』的交互」，
// 以及实战步骤第 1 条要求的四态表：操作前 / 处理中 / 成功 / 失败。
//
// 为什么做成「浮在视口底部的条」，而不是写在队列里：
//   ① 用户点的是队列里的某一张卡，眼睛就在那儿 —— 反馈不能离视线太远，
//      但也不能盖住队列（他还得接着点下一件）。固定在底部是这两点的折中；
//   ② **点掉最后一件任务时，队列会整块换成「待办清空了」的空状态。**
//      提示条如果长在队列里，会跟着一起被卸载 —— 用户刚好丢掉唯一的撤销机会。
//      挂在外壳（App）上就绕开了这个坑。
//
// ⚠️ 图标用内联 SVG，不用「✓」这个字符：微软雅黑里没有它的字形，
//    会渲染成一个空方框（Day 10 出标注图时踩过一次）。

import { useEffect, useState } from 'react'
import type { ActionFeedback } from './useTaskQueue'

interface ActionToastProps {
  feedback: ActionFeedback | null
  /** 有写入在进行时，提示条上的按钮也要禁用，避免连点 */
  busy: boolean
  onUndo: () => Promise<boolean>
  onRetry: () => Promise<boolean>
  onDismiss: () => void
}

/** 「可以撤销」这个窗口留多久。太短来不及反应，太长会一直挡着页面 */
const UNDO_WINDOW_MS = 5000
/** 「已撤销」只是报一声，不需要用户做什么，所以走得快 */
const REPORT_MS = 2500

export function ActionToast({ feedback, busy, onUndo, onRetry, onDismiss }: ActionToastProps) {
  // 鼠标移上来、或者焦点进到提示条里，就把倒计时停住。
  // 否则用户正要去点「撤销」，条自己先走了 —— 那是很恼人的体验。
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    // ⚠️ failed 不在自动收起的名单里：失败提示必须等用户看见、处理完。
    // 自动消失等于把「下一步怎么做」也一起吞了。
    if (feedback === null || feedback.kind === 'failed' || paused) return

    const timer = window.setTimeout(
      onDismiss,
      feedback.kind === 'done' ? UNDO_WINDOW_MS : REPORT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [feedback, paused, onDismiss])

  if (feedback === null) return null

  const failed = feedback.kind === 'failed'

  return (
    <div
      className={`toast toast-${feedback.kind}`}
      // role=status + aria-live=polite：读屏用户也能听到「已完成 XXX」，
      // 而不是只有看得见的人才知道发生了什么。
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        // 焦点只是在提示条内部换了个按钮，不算离开
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <span className="toast-icon" aria-hidden="true">
        {failed ? <WarnIcon /> : <CheckIcon />}
      </span>

      <p className="toast-text">
        {feedback.kind === 'done' && <>已完成「{feedback.title}」</>}
        {feedback.kind === 'undone' && <>已撤销，「{feedback.title}」回到队列</>}
        {failed && (
          <>
            {feedback.retry === 'undo' ? '撤销' : '完成'}「{feedback.title}」失败：{feedback.detail}
          </>
        )}
      </p>

      {feedback.kind === 'done' && (
        <button type="button" className="toast-action" onClick={() => void onUndo()} disabled={busy}>
          {busy ? '撤销中…' : '撤销'}
        </button>
      )}

      {failed && (
        <button type="button" className="toast-action" onClick={() => void onRetry()} disabled={busy}>
          {busy ? '重试中…' : '重试'}
        </button>
      )}

      <button type="button" className="toast-close" onClick={onDismiss} aria-label="关闭提示">
        ×
      </button>
    </div>
  )
}

/** 成功图标：一个圈 + 一个勾 */
function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor">
      <circle cx="10" cy="10" r="8.4" strokeWidth="1.5" />
      <path
        d="M6 10.4l2.6 2.6L14.2 7.6"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 失败图标：一个圈 + 一个感叹号 */
function WarnIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor">
      <circle cx="10" cy="10" r="8.4" strokeWidth="1.5" />
      <path d="M10 5.6v5.2" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 13.9v.5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
