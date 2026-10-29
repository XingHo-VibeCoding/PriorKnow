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
//
// Day 13：原来住在这里的「数据层状态」开发开关**搬去了页面外壳**（见 DevStateSwitch）。
//   搬的理由：分成三个视图之后，要演示「加载中」得先跑到这一页改开关、再切回首页看效果 ——
//   而切走的那一瞬间这一页自己也在加载中，两边都看不清。
//   它本来就是「让看不见的状态变得看得见」的工具，不是数据管理的一部分。
//   ⚠️ 结果：这个组件现在**不接收** dataMode 了 —— 它只管数据，不管演示。

import { useRef, useState, type ChangeEvent } from 'react'
import { taskRepo } from '../data'
import type { Task } from '../core/types'
import { ErrorNote } from './ErrorNote'
import { explainError, inputError, type ExplainedError } from './errors'
import type { TaskQueue } from './useTaskQueue'

interface DataPanelProps {
  queue: TaskQueue
}

/**
 * 一次操作的结果提示。tone 决定它是绿的还是红的。
 *
 * Day 23 起失败的那一支不再是一条裸字符串，而是 explainError 的产物 ——
 * 于是「导出失败」「文件格式不对」「导入没完成」三种坏消息各自带上
 * 自己的类别标签，而不是三句长得一样的「某某失败：xxx」。
 *
 * 用判别联合（而不是 `{text, tone, error?}` 那种可选字段）是为了让
 * 「成功必有文案、失败必有类别」由**类型系统**保证：
 * 少填一样就编译不过，不必等到运行时才发现提示是空白的。
 */
type Status =
  | { tone: 'ok'; text: string }
  | { tone: 'bad'; error: ExplainedError }

export function DataPanel({ queue }: DataPanelProps) {
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

      setStatus({ tone: 'ok', text: `已导出 ${list.length} 件任务。` })
    } catch (err) {
      setStatus({ tone: 'bad', error: explainError(err, '导出') })
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
      setStatus({
        tone: 'bad',
        error: inputError('文件格式不正确，已保留你原来的数据（内容不是合法的 JSON）。'),
      })
      return
    }

    if (!Array.isArray(parsed)) {
      setStatus({
        tone: 'bad',
        error: inputError('文件格式不正确，已保留你原来的数据（顶层应该是一个任务数组）。'),
      })
      return
    }

    const ok = window.confirm(
      `导入会清掉现有的 ${total} 件任务，换成文件里的 ${parsed.length} 件。继续？`,
    )
    if (!ok) {
      setStatus({ tone: 'ok', text: '已取消导入，原数据未改动。' })
      return
    }

    // ⚠️ 这里把 unknown 断言成 Task[]：文件内容本来就是不可信的，
    // 类型系统管不了「用户手改过的 JSON」。真正的把关在数据层的 importAll ——
    // 它逐条校验，任何一条不合法就在**动库之前**抛错，所以原数据仍然安全。
    const succeeded = await act(() => taskRepo.importAll(parsed as Task[]), '导入失败')

    setStatus(
      succeeded
        ? { tone: 'ok', text: `已导入 ${parsed.length} 件任务，原有数据已被替换。` }
        : {
            tone: 'bad',
            // 数据层会逐条验完才动库，所以走到这里原数据一定是安全的。
            // 具体是哪一条、哪个字段，在队列那一块会以「输入问题」的形式列出来。
            error: inputError(
              '导入未完成：文件内容有问题，你原来的数据没有被改动（具体是哪一条，见队列那一块的提示）。',
            ),
          },
    )
  }

  /** 载入示例数据。确认逻辑在 hook 里（队列的空状态也要用同一个入口） */
  async function handleLoadSamples() {
    const succeeded = await loadSamples()
    setStatus(
      succeeded
        ? { tone: 'ok', text: '已载入 7 件示例任务（期末周冲刺）。' }
        : { tone: 'ok', text: '没有载入示例数据，原数据未改动。' },
    )
  }

  return (
    <section className="card">
      <h2>数据与设置</h2>

      <p className="hint">
        任务是<strong>这台设备本地</strong>的：导出成 JSON 可以备份，或者换台电脑导进去。
        想让它出现在云端和别的设备上，用下面的「云端同步」。
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

      {/* 成功是一条绿条，失败是「标签 + 一句话」—— 两者都用 .status 的壳，
          所以上下位置和留白完全一样，变的是内容结构。 */}
      {status !== null &&
        (status.tone === 'ok' ? (
          <p className="status status-ok">{status.text}</p>
        ) : (
          <ErrorNote error={status.error} className="status status-bad" />
        ))}
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
