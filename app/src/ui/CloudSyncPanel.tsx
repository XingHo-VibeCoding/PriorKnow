// 云端同步（试运行）—— 把「接口能不能通」这件事变成看得见的一次点击
//
// 为什么单独一块，而不是塞进「数据与设置」那张卡？
//   数据与设置管的是**本机数据**（导出 / 导入 / 示例），全部同步完成、立刻有结果。
//   这一块管的是**网络**：可能慢、可能失败、可能被服务端拒绝。
//   两者的失败方式完全不同，混在一张卡里，用户分不清「我的文件有问题」还是「网没通」。
//
// ⚠️ 这里**不动本机库**。推上去只是推一份副本，拉回来也只是显示条数 ——
//    真正把云端合并进本机（谁赢、离线怎么办）是 Day 20 的活。
//    这一块现在的价值只有一个：证明链路是通的、两边的校验都真的在工作。
//
// 🔴 三条不能踩的：
//    ① 不套 useTaskQueue 的 act()。那个会把失败写进 queue.error，
//       而 TasksPage 一看到 error 就整页换成错误块（第 90–97 行）——
//       同步失败不该让「我的一堆任务」消失。所以失败只在本块里说。
//    ② 不用 `{ ...task }` 拼请求体。seq 会被一起带上，序号就回退了。
//       白名单在 data/cloud-sync.ts 的 toRow 里。
//    ③ 推送返回的 cursor 不拿来当游标。它是「本区云端最大 seq」，
//       而本机可能还没拉过别的设备写在这个序号之前的记录 —— 直接当 since 会跳过它们。
//       游标只由 GET 的 cursor 推进。

import { useState } from 'react'
import { taskRepo } from '../data'
import {
  SyncError,
  loadConfig,
  loadCursor,
  postRows,
  pullSince,
  pushTasks,
  saveConfig,
  saveCursor,
  type RejectedItem,
  type SyncConfig,
} from '../data/cloud-sync'
import type { TaskQueue } from './useTaskQueue'
import { describeError } from './format'

interface CloudSyncPanelProps {
  queue: TaskQueue
}

interface Outcome {
  text: string
  tone: 'ok' | 'bad'
  /** 逐条拒绝原因。只有「被服务端拒了」才有 */
  rejected: RejectedItem[]
}

export function CloudSyncPanel({ queue }: CloudSyncPanelProps) {
  const { total } = queue

  const [config, setConfig] = useState<SyncConfig>(loadConfig)
  const [cursor, setCursor] = useState<number>(loadCursor)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  /** 改配置即存。localStorage 写一次是同步的、很便宜，不值得为它加个「保存」按钮 */
  function updateConfig(patch: Partial<SyncConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(next)
  }

  /** 三个按钮共用一段「忙 → 试 → 收结果」，只有中间那步不一样 */
  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await action())
    } catch (err) {
      const rejected = err instanceof SyncError ? err.rejected : []
      const base = err instanceof SyncError ? err.message : `同步失败：${describeError(err)}`
      setOutcome({
        // 逐条原因在下面单独列出来，这里只报「共几条」，别把 7 条原因挤成一句话
        text: rejected.length > 0 ? `${base}（${rejected.length} 件被拒，原因见下）` : base,
        tone: 'bad',
        rejected,
      })
    } finally {
      setBusy(false)
    }
  }

  /** ① 推送本机全部任务 */
  function handlePush() {
    void run(async () => {
      const tasks = await taskRepo.listTasks()
      const data = await pushTasks(tasks, config)
      const corrected = data.accepted.filter((item) => item.corrected).length

      // ⚠️ 部分成功时不能只报好消息：201 只代表「至少有一条被接收」，
      //    被拒的那几条如果不说，用户会以为全都上去了。
      const parts = [`推上去 ${data.accepted.length} 件`]
      if (corrected > 0) parts.push(`其中 ${corrected} 件被服务端修正过（例如星级越界）`)
      if (data.rejected.length > 0) parts.push(`另有 ${data.rejected.length} 件被拒，原因见下`)
      parts.push(`云端本区最大序号 ${data.cursor}`)

      return {
        text: parts.join('，') + '。',
        tone: data.rejected.length > 0 ? 'bad' : 'ok',
        rejected: data.rejected,
      }
    })
  }

  /** ② 按游标拉变化 */
  function handlePull() {
    void run(async () => {
      const data = await pullSince(cursor, config)
      saveCursor(data.cursor)
      setCursor(data.cursor)

      const parts = [`拉到 ${data.items.length} 条变化`]
      if (data.notice !== null) parts.push(`提示：${data.notice}`)
      parts.push(`新游标 ${data.cursor}`)
      if (data.hasMore) parts.push('云端说还有更多，再点一次继续')
      return { text: parts.join(' · '), tone: 'ok', rejected: [] }
    })
  }

  /**
   * ③ 服务端校验自检 —— 故意发一条前端绝不会发出的坏数据。
   *
   * 前端自己的校验在 createTask 里（空标题直接抛错），所以正常点按钮
   * **永远不会**把不合法数据发出去，「服务端也拦了一道」这件事就没有证据。
   * 这条通路绕开前端校验，专门去问服务端：你会不会拒？
   *
   * ⚠️ 结果的好坏与 HTTP 状态码是**反过来的**：
   *    服务端回 400「拒了」= 校验生效 = 好消息（绿色）；
   *    服务端回 201「收下了」= 校验失效 = 坏消息（红色）。
   *    所以这里自己 catch，不能让它走 run() 的失败分支 ——
   *    那条分支一律判成红色，会把结论说反。
   */
  function handleProbe() {
    void run(async () => {
      const probeId = `probe-${Date.now().toString(36)}`

      try {
        const data = await postRows([{ id: probeId, title: '' }], config)
        return {
          text: `⚠️ 服务端收下了空标题（accepted ${data.accepted.length} 条）——「标题不能为空」这条校验没有生效。`,
          tone: 'bad',
          rejected: [],
        }
      } catch (err) {
        // 只要服务端逐条给出了拒绝理由，就说明第二道闸真的在工作
        if (err instanceof SyncError && err.rejected.length > 0) {
          return {
            text: `服务端拒了这条（HTTP ${err.status}）—— 第二道校验生效。前端本来就不该发出这种数据。`,
            tone: 'ok',
            rejected: err.rejected,
          }
        }
        // 连 rejected 都没有，说明不是「被校验拦下」，而是别的问题，照实报错
        throw err
      }
    })
  }

  const ready = config.baseUrl.trim() !== '' && config.userId.trim() !== ''

  return (
    <section className="card">
      <h2>云端同步（试运行）</h2>

      <p className="hint">
        任务仍然只存在<strong>这台设备的浏览器里</strong>。这一块只做一件事：
        把本机任务推一份到云端、再按序号拉回来，先确认<strong>接口是通的</strong>。
        真正的合并（两台设备都改过怎么办、断网时先记哪）留到后面做。
      </p>

      <div className="sync-fields">
        <label className="field">
          接口地址
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => updateConfig({ baseUrl: e.target.value })}
            placeholder="https://<环境ID>.service.tcloudbase.com/api"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field">
          用户编号
          <input
            type="text"
            value={config.userId}
            onChange={(e) => updateConfig({ userId: e.target.value })}
            placeholder="demo-user-001"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </div>

      <p className="sync-meta">
        本机 <strong>{total}</strong> 件任务 · 当前游标 <strong>{cursor}</strong>
        {cursor === 0 && '（0 表示还没从云端拉过）'}
      </p>

      <div className="btn-row">
        <button type="button" onClick={handlePush} disabled={busy || !ready}>
          {busy ? '请求中…' : '推送本机任务'}
        </button>
        <button type="button" onClick={handlePull} disabled={busy || !ready}>
          按游标拉取
        </button>
        <button type="button" onClick={handleProbe} disabled={busy || !ready}>
          服务端校验自检
        </button>
      </div>

      {!ready && (
        <p className="sync-meta">先填上面两项，地址在云开发控制台的「云函数 → 访问地址」里。</p>
      )}

      {outcome !== null && (
        <>
          <p className={`status status-${outcome.tone}`}>{outcome.text}</p>
          {outcome.rejected.length > 0 && (
            <ul className="sync-rejected">
              {outcome.rejected.map((item) => (
                <li key={`${item.index}-${item.reason}`}>
                  第 {item.index + 1} 条：{item.reason}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
