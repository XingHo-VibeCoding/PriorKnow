// 云端同步（试运行）—— 把「接口能不能通」这件事变成看得见的一次点击
//
// 为什么单独一块，而不是塞进「数据与设置」那张卡？
//   数据与设置管的是**本机数据**（导出 / 导入 / 示例），全部同步完成、立刻有结果。
//   这一块管的是**网络**：可能慢、可能失败、可能被服务端拒绝。
//   两者的失败方式完全不同，混在一张卡里，用户分不清「我的文件有问题」还是「网没通」。
//
// ⚠️ 这里**会动本机库**（Day 20 起）：拉回来不只是显示条数，而是真的落到本地、
//    让队列跟着变。没有这一步，公网页面上「拉到了 8 条变化」但列表还是空的 ——
//    那只能证明链路通，证明不了应用能用。
//    仍然**没做**的是真正的双向合并：谁赢、离线时先记哪、两边都改过怎么办。
//    现在的语义是「远端为准、逐条覆盖」，见 repository.ts 的 applyRemote。
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
  loadOwner,
  postRows,
  pullSince,
  pushTasks,
  saveConfig,
  saveCursor,
  saveOwner,
  type RejectedItem,
  type SyncConfig,
} from '../data/cloud-sync'
import type { TaskQueue } from './useTaskQueue'
import { ErrorNote } from './ErrorNote'
import { explainError, type ExplainedError } from './errors'

interface CloudSyncPanelProps {
  queue: TaskQueue
}

interface Outcome {
  text: string
  tone: 'ok' | 'bad'
  /** 逐条拒绝原因。只有「被服务端拒了」才有 */
  rejected: RejectedItem[]
  /**
   * 失败时的分类标签（Day 23）。
   *
   * 成功时为 undefined —— 成功没什么可分类的，硬给它贴个标签只是噪音。
   * 有它的时候界面用 ErrorNote 渲染，于是「网络问题」「服务端问题」
   * 这两个标签会和页面其他地方长得一模一样。
   */
  failure?: ExplainedError
}

export function CloudSyncPanel({ queue }: CloudSyncPanelProps) {
  const { total, refresh } = queue

  const [config, setConfig] = useState<SyncConfig>(loadConfig)
  /** 本机这批任务属于谁。本机只有一本账，换号之前必须先把它请出去 */
  const [owner, setOwner] = useState<string | null>(loadOwner)
  const [cursor, setCursor] = useState<number>(() => loadCursor(loadConfig().userId))
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  /** 改配置即存。localStorage 写一次是同步的、很便宜，不值得为它加个「保存」按钮 */
  function updateConfig(patch: Partial<SyncConfig>) {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(next)
    // 换了用户编号，游标要跟着换 —— 游标是按用户存的。
    // 不跟着换，界面上会显示上一个号的进度，那是在骗人。
    if (patch.userId !== undefined) setCursor(loadCursor(next.userId))
  }

  /** 当前填的用户编号（去掉首尾空格） */
  const currentUser = config.userId.trim()

  /**
   * 本机数据属于别人 —— 唯一需要「先处理再继续」的状态。
   *
   * 只要它成立，推送和拉取都不许点：
   *   · 推送 → 把上一个号的任务整批写进当前号名下（污染对方的账号）
   *   · 拉取 → 两个号的任务混成一张列表，之后再也分不开（本机没有 user_id 列）
   * 所以按钮直接禁用，并在上面把话说清楚、给一条出路，而不是点下去才弹错误。
   */
  const mismatch = owner !== null && currentUser !== '' && owner !== currentUser

  /** 三个按钮共用一段「忙 → 试 → 收结果」，只有中间那步不一样 */
  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome(await action())
    } catch (err) {
      const rejected = err instanceof SyncError ? err.rejected : []
      // Day 23：不再自己拼「同步失败：」前缀 —— 分类和文案交给 explainError，
      // 它会把 SyncError 的 status 0 / 4xx / 5xx 分成网络问题、服务端问题两种，
      // 其余异常落到本机数据或「未预料的问题」。前缀换成「同步」两个字即可。
      // 不补「同步」前缀：标签已经说了是哪一类，这张卡本身就在说云端同步。
      // 补上会变成「同步：服务端拒绝了这次请求（HTTP 400）：…」—— 一句话两个冒号。
      const explained = explainError(err)
      // 逐条原因在下面单独列出来，这里只报「共几条」，别把 7 条原因挤成一句话
      const text =
        rejected.length > 0 ? `${explained.text}（${rejected.length} 件被拒，原因见下）` : explained.text

      setOutcome({
        text,
        tone: 'bad',
        rejected,
        failure: { ...explained, text },
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

      // 第一次跟这个号打交道：这批任务从此归它。
      // 放在**成功之后**记，失败的东西不该被认领。
      if (owner === null) {
        saveOwner(currentUser)
        setOwner(currentUser)
      }

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

  /** ② 按游标拉变化 —— Day 20 起会真的写进本机库 */
  function handlePull() {
    void run(async () => {
      const data = await pullSince(cursor, config)

      // 🔴 顺序不能反：先落库、再挪游标。
      //    万一落库失败而游标已经前进了，那批变化就永远拉不回来了（云端不会再发一次）。
      const applied = await taskRepo.applyRemote(data.items)

      // 游标按用户存 —— 同一台机器上换过号，两个号各自的进度不会互相踩
      saveCursor(currentUser, data.cursor)
      setCursor(data.cursor)
      if (owner === null) {
        saveOwner(currentUser)
        setOwner(currentUser)
      }
      // 队列重读一次，页面上立刻能看到拉到的东西
      void refresh()

      const parts = [`拉到 ${data.items.length} 条变化`]
      if (applied.inserted > 0 || applied.updated > 0) {
        parts.push(`本机新增 ${applied.inserted} 件、覆盖 ${applied.updated} 件`)
      }
      if (applied.removed > 0) parts.push(`删掉 ${applied.removed} 件（云端已删）`)
      if (data.notice !== null) parts.push(`提示：${data.notice}`)
      parts.push(`新游标 ${data.cursor}`)
      if (data.hasMore) parts.push('云端说还有更多，再点一次继续')
      return { text: parts.join(' · '), tone: 'ok', rejected: [] }
    })
  }

  /**
   * 换用户编号时唯一正确的出路：把这本账清空，再认新主人。
   *
   * 不做「自动清空」—— 清数据必须用户点头，而且要让他先知道**云端不受影响**，
   * 否则他会以为按一下就全没了，于是宁可不点、继续混着用。
   */
  function handleSwitchOwner() {
    const target = currentUser
    if (target === '' || owner === null) return

    const confirmed = window.confirm(
      `这台设备上的 ${total} 件任务属于「${owner}」。\n\n` +
        `清空之后它们会从这台设备消失，这本账改为「${target}」的。\n` +
        `云端两边都不动 ——「${owner}」的任务还在云端，换回去再拉就能回来。\n\n` +
        '确定清空本机数据吗？',
    )
    if (!confirmed) {
      setOutcome({ text: '已取消，本机数据未改动。', tone: 'ok', rejected: [] })
      return
    }

    void run(async () => {
      const removed = await taskRepo.clearAll()
      saveOwner(target)
      setOwner(target)
      // 🔴 游标必须跟着归零：不归零的话，下次拉取从「上一个号」的进度开始，
      //    这个号早期的记录就永远拉不回来了，而且界面上看起来一切正常。
      saveCursor(target, 0)
      setCursor(0)
      void refresh()
      return {
        text: `已清空本机 ${removed} 件任务，这本账现在归「${target}」。可以点「按游标拉取」了 —— 从 0 开始，是全量。`,
        tone: 'ok',
        rejected: [],
      }
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
        任务是<strong>以这台设备的浏览器为准</strong>的，云端只存一份副本。
        「推送」把本机任务传上去，「拉取」把云端的改动<strong>落到本机</strong>、列表跟着变。
        还没做的是真正的双向合并 —— 两台设备改过同一条时谁赢、断网时先记哪。
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
        本机 <strong>{total}</strong> 件任务 ·{' '}
        {owner === null ? (
          '还没归属任何用户'
        ) : (
          <>
            属于「<strong>{owner}</strong>」
          </>
        )}{' '}
        · 游标 <strong>{cursor}</strong>
        {cursor === 0 && '（0 表示从这个号的起点开始拉）'}
      </p>

      {/* 换了用户编号 —— 这件事必须先说清再让路走通。
          不做成「点下去才报错」，因为这里的错不是失败，是**会把数据写错地方**。
          本机只有一本账，所以只有一条出路：清空本机、认新主人。 */}
      {mismatch && (
        <div className="sync-warn">
          <p className="sync-warn-title">
            本机数据属于「{owner}」，不是「{currentUser}」
          </p>
          <p className="sync-warn-body">
            这台设备只有一本账。现在点推送，会把「{owner}」的 {total} 件任务写到「{currentUser}」名下；
            现在点拉取，两个号的任务会混成一张列表 —— <strong>之后再也分不开</strong>。
            所以要换号，得先把这本账清出去。
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="danger"
              onClick={handleSwitchOwner}
              disabled={busy}
            >
              清空本机 {total} 件，切换到「{currentUser}」
            </button>
          </div>
          <p className="sync-warn-foot">
            云端两边都不动 ——「{owner}」的任务还在云端，换回去再拉就能回来。
          </p>
        </div>
      )}

      <div className="btn-row">
        <button type="button" onClick={handlePush} disabled={busy || !ready || mismatch}>
          {busy ? '请求中…' : '推送本机任务'}
        </button>
        <button type="button" onClick={handlePull} disabled={busy || !ready || mismatch}>
          按游标拉取
        </button>
        <button type="button" onClick={handleProbe} disabled={busy || !ready || mismatch}>
          服务端校验自检
        </button>
      </div>

      {!ready && (
        <p className="sync-meta">先填上面两项，地址在云开发控制台的「云函数 → 访问地址」里。</p>
      )}

      {outcome !== null && (
        <>
          {outcome.failure !== undefined ? (
            <ErrorNote error={outcome.failure} className={`status status-${outcome.tone}`} />
          ) : (
            <p className={`status status-${outcome.tone}`}>{outcome.text}</p>
          )}
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
