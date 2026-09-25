// 数据与设置 —— PRD 5.4 的那个入口
//
// 依据：PRD 5.4（导出 JSON / 导入 JSON / 载入示例数据）+ 第七节（导入格式不对要给中文提示、原数据不动）。
//
// 三个按钮背后是三种不同的责任，值得分开说：
//   · 导出 —— 只读，永远安全。给用户一条「数据在我手上」的退路。
//   · 导入 —— 会覆盖全部数据，所以：先确认 → 再校验 → 最后才动库。
//             校验交给数据层的 importAll（它在动库之前逐条验完），
//             这里只负责把「文件根本不是 JSON」这类**连校验都进不去**的情况挡在门外。
//   · 载入示例 —— 也是覆盖，但数据由我们自己造，不会格式错，所以重点是确认。

import { useRef, useState, type ChangeEvent } from 'react'
import { taskRepo } from '../data'
import type { Task } from '../core/types'
import { describeError } from './format'
import type { DataMode, TaskQueue } from './useTaskQueue'

interface DataPanelProps {
  queue: TaskQueue
  /** 数据层的演示模式（正常 / 慢速 / 失败） */
  dataMode: DataMode
  onDataModeChange: (next: DataMode) => void
}

/** 一次操作的结果提示。tone 决定它是绿的还是红的。 */
interface Status {
  text: string
  tone: 'ok' | 'bad'
}

export function DataPanel({ queue, dataMode, onDataModeChange }: DataPanelProps) {
  const { total, busy, act, loadSamples } = queue
  const [status, setStatus] = useState<Status | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 导出：把库里全部任务存成一个 JSON 文件交给用户 */
  async function handleExport() {
    try {
      const list = await taskRepo.exportAll()

      // 用 Blob + 临时链接触发下载。文件名带上日期，导出多次也不会互相覆盖。
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `priorknow-${todayStamp()}.json`
      link.click()
      URL.revokeObjectURL(url)

      setStatus({ text: `已导出 ${list.length} 件任务。`, tone: 'ok' })
    } catch (err) {
      setStatus({ text: '导出失败：' + describeError(err), tone: 'bad' })
    }
  }

  /** 导入：读文件 → 解析 → 确认 → 交给数据层覆盖 */
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    // 立刻清空 input 的值，否则连续两次选同一个文件不会触发 change
    event.target.value = ''
    if (!file) return

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      // 连 JSON 都不是 —— 这时还没碰过数据库
      setStatus({ text: '文件格式不正确，已保留你原来的数据（内容不是合法的 JSON）。', tone: 'bad' })
      return
    }

    if (!Array.isArray(parsed)) {
      setStatus({ text: '文件格式不正确，已保留你原来的数据（顶层应该是一个任务数组）。', tone: 'bad' })
      return
    }

    const ok = window.confirm(
      `导入会清掉现有的 ${total} 件任务，换成文件里的 ${parsed.length} 件。继续？`,
    )
    if (!ok) {
      setStatus({ text: '已取消导入，原数据未改动。', tone: 'ok' })
      return
    }

    // ⚠️ 这里把 unknown 断言成 Task[]：文件内容本来就是不可信的，
    // 类型系统管不了「用户手改过的 JSON」。真正的把关在数据层的 importAll ——
    // 它逐条校验，任何一条不合法就在**动库之前**抛错，所以原数据仍然安全。
    const succeeded = await act(() => taskRepo.importAll(parsed as Task[]), '导入失败')

    setStatus(
      succeeded
        ? { text: `已导入 ${parsed.length} 件任务，原有数据已被替换。`, tone: 'ok' }
        : { text: '导入未完成：文件内容有问题，你原来的数据没有被改动（具体原因见上方队列的错误提示）。', tone: 'bad' },
    )
  }

  /** 载入示例数据。确认逻辑在 hook 里（队列的空状态也要用同一个入口） */
  async function handleLoadSamples() {
    const succeeded = await loadSamples()
    setStatus(
      succeeded
        ? { text: '已载入 7 件示例任务（期末周冲刺）。', tone: 'ok' }
        : { text: '没有载入示例数据，原数据未改动。', tone: 'ok' },
    )
  }

  return (
    <section className="card">
      <h2>数据与设置</h2>

      <p className="hint">
        任务只存在<strong>这台设备的浏览器里</strong>，不上传任何服务器。导出成 JSON 可以备份，
        或者换台电脑导入过去。
      </p>

      <div className="btn-row">
        <button type="button" onClick={handleExport} disabled={busy}>
          导出 JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
          导入 JSON
        </button>
        <button type="button" className="danger" onClick={handleLoadSamples} disabled={busy}>
          载入示例数据
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={handleFile}
        aria-label="选择要导入的 JSON 文件"
      />

      {status !== null && <p className={`status status-${status.tone}`}>{status.text}</p>}

      <div className="dev">
        <label className="dev-row" htmlFor="data-mode">
          <span className="dev-label">数据层状态（开发用）</span>
          <select
            id="data-mode"
            className="dev-select"
            value={dataMode}
            onChange={(event) => onDataModeChange(event.target.value as DataMode)}
          >
            <option value="normal">正常</option>
            <option value="slow">模拟慢速读取 —— 看「加载中」</option>
            <option value="fail">模拟读取失败 —— 看「错误」</option>
          </select>
        </label>
        <p className="dev-note">
          本地数据库读一次只要几毫秒，「加载中」和「错误」平时根本看不见。
          这个开关把这两种状态主动演出来，好确认它们真的存在、也真的能用。
        </p>
      </div>
    </section>
  )
}

/** 导出文件名里的日期戳，形如 2026-09-23 */
function todayStamp(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
