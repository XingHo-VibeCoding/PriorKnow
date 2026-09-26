// 加任务表单 —— Day 7 第 4 步的入口，也就是闭环里的「来」
//
// 依据：PRD 5.1（今日队列顶部能加任务）+ PRD 第六节（数据字段）。
//
// ⚠️ 这个表单里**没有「优先级」这一项**，是刻意去掉的。
// PRD F2 要求用户只填「截止时间 + 重要度 + 预计耗时」，优先级由系统算。
// 正因为少了这一项，这个表单才成为「自动排序」的证明，
// 而不是又一个普通的待办清单。
//
// ⚠️ 这里同样不碰 IndexedDB —— 只 import data/ 出口的 taskRepo。

import { useState, type FormEvent } from 'react'
import { taskRepo } from '../data'
import { DEFAULT_IMPORTANCE, type Importance } from '../core/types'

const STARS: Importance[] = [1, 2, 3, 4, 5]

interface TaskComposerProps {
  /** 新增成功后通知外面：重新读库、重排队列 */
  onCreated: (note: string) => void | Promise<void>
}

export function TaskComposer({ onCreated }: TaskComposerProps) {
  const [title, setTitle] = useState('')
  const [dueLocal, setDueLocal] = useState('')
  const [estimate, setEstimate] = useState('')
  const [importance, setImportance] = useState<Importance>(DEFAULT_IMPORTANCE)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const trimmed = title.trim()
    if (trimmed === '') {
      setError('标题不能为空 —— 这是唯一的必填项')
      return
    }

    // datetime-local 控件给的是本地时间字符串（形如 2026-09-23T18:00，不带时区）。
    // 先交给 Date 按本地时区解析，再转成 ISO 字符串入库，避免时区歧义。
    const dueAt = dueLocal === '' ? null : new Date(dueLocal).toISOString()

    // ⚠️ 耗时留空必须存 null（表示「未估算」），**不能存 0**。
    // 算法里 0 分钟会被当成「瞬间完成」，省时度直接顶格，等于凭空加分。
    const estimateMinutes = estimate.trim() === '' ? null : Number(estimate)
    if (estimateMinutes !== null && (!Number.isFinite(estimateMinutes) || estimateMinutes <= 0)) {
      setError('预计耗时要么留空，要么填一个大于 0 的分钟数')
      return
    }

    setBusy(true)
    setError('')
    try {
      await taskRepo.createTask({ title: trimmed, dueAt, estimateMinutes, importance })

      // 清空表单，方便连着加下一条；重要度回到默认的 3 星
      setTitle('')
      setDueLocal('')
      setEstimate('')
      setImportance(DEFAULT_IMPORTANCE)

      await onCreated(`已加入「${trimmed}」，队列已重排`)
    } catch (err) {
      setError('保存失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <input
        className="composer-title"
        type="text"
        placeholder="要做什么？例如：下周一交的实验报告"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={busy}
        aria-label="任务标题"
      />

      <div className="composer-row">
        <label className="field">
          <span>截止时间</span>
          <input
            type="datetime-local"
            value={dueLocal}
            onChange={(event) => setDueLocal(event.target.value)}
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>预计耗时</span>
          <input
            type="number"
            min="1"
            placeholder="分钟，可留空"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            disabled={busy}
          />
        </label>

        <div className="field">
          <span>重要度</span>
          <div className="stars">
            {STARS.map((star) => {
              const on = star <= importance
              return (
                <button
                  key={star}
                  type="button"
                  className={on ? 'star on' : 'star'}
                  onClick={() => setImportance(star)}
                  disabled={busy}
                  aria-label={`${star} 星`}
                  aria-pressed={on}
                >
                  {/* Day 9 修复②：选中「实心 ★」、未选中「空心 ☆」。
                      原来两者都是 ★，只靠颜色深浅区分，而未选中的灰
                      对白底只有 1.31:1（几乎看不见）。现在「形状 + 颜色」
                      双重区分 —— 色障用户也能一眼看出点了几星。 */}
                  {on ? '★' : '☆'}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="composer-foot">
        <button type="submit" className="primary" disabled={busy}>
          加入队列
        </button>
        <span className="composer-note">优先级由系统算，不用你标</span>
      </div>

      {error !== '' && <p className="composer-error">{error}</p>}
    </form>
  )
}
