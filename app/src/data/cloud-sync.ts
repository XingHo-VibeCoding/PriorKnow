// 云同步客户端 —— 第 3 周「换零件」的第一颗螺丝
//
// 依据：docs/规格/api-contract.md（第二版）第三节响应壳 + 第六节 GET + 第七节 POST。
//
// ⚠️ 先说清它与 repository.ts 的分工，否则很容易写成四不像：
//
//     repository.ts  = 数据层的**接口**（契约）。前端所有读写都只认它。
//     local-indexeddb.ts = 接口的本机实现（第 1–2 周干活的那个）。
//     本文件          = 一个**独立的网络客户端**，只回答两件事：
//                       ① 把一批任务推上去 ② 按游标拉变化回来。
//
// 为什么不直接写成 `CloudBaseTaskRepository implements TaskRepository`？
//   因为仓储接口的语义是「读写立刻有结果」（listTasks 一 await 就有数组）。
//   一旦背后是网络，就必须回答一串新问题：网断了怎么办、两边都改了谁赢、
//   离线时用户的操作先记哪 —— 那是 Day 20 的活。
//   现在先把「通不通」单独验证掉：接不起来的地方，一眼就能看见。
//
// 🔴 这个文件里**只有网络**：不 import Dexie、不 import taskRepo。
//    它甚至不知道「本机库」的存在 —— 传进来什么就发什么。

import type { Task } from '../core/types'

/** 同步配置。用户区编号对应请求头 X-User-Id */
export interface SyncConfig {
  /** 接口根地址，例如 https://<envId>.service.tcloudbase.com/api */
  baseUrl: string
  /** 用户区编号。Day 23 之前是固定的假身份，登录上线后才由认证提供 */
  userId: string
}

/** 一条被服务端拒绝的记录 */
export interface RejectedItem {
  /** 在请求数组里的下标；请求级拒绝（比如整批太大）是 -1 */
  index: number
  reason: string
}

/** POST 成功时 data 的形状 */
export interface PushData {
  cursor: number
  accepted: Array<{
    id: string
    seq: number
    /** 存进库的内容与请求不完全一致时才有 */
    corrected?: boolean
    task: RemoteTask
  }>
  rejected: RejectedItem[]
}

/** GET 成功时 data 的形状 */
export interface PullData {
  items: RemoteTask[]
  cursor: number
  hasMore: boolean
  /** 非 null 只代表一件事：这次其实是全量，不是增量 */
  notice: string | null
}

/**
 * 云端返回的一条任务 —— 比本机 Task 多三个字段。
 *
 * 这三个字段是同步的底座：seq 是变更序号，deletedAt 是回收站，
 * purgedAt 是墓碑。本机 Task 暂时没有它们（Day 20 合并时才加），
 * 所以这里单独定义，**不硬塞进 core/types.ts** —— 免得界面层以为本机也有。
 */
export interface RemoteTask extends Task {
  seq: number
  deletedAt: string | null
  purgedAt: string | null
}

/**
 * 同步过程中的错误。
 *
 * 比普通 Error 多带两样东西，因为界面上要用：
 *   · status   —— HTTP 状态码（0 表示连请求都没发出去）
 *   · rejected —— 服务端逐条给的拒绝原因，直接摊给用户看
 */
export class SyncError extends Error {
  readonly status: number
  readonly rejected: RejectedItem[]

  constructor(message: string, status = 0, rejected: RejectedItem[] = []) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    this.rejected = rejected
  }
}

// ---------- 配置的存取 ----------

const CONFIG_KEY = 'priorknow-sync-config'
const CURSOR_KEY = 'priorknow-sync-cursor'

/**
 * 配置默认值。
 *
 * ⚠️ baseUrl 故意留空，不写死某个环境的地址：
 * 写死之后换环境就得改代码重新构建，而且仓库里躺着一个只对某台机器有效的地址。
 * 空值 + 输入框里的 placeholder（提示格式）既能让人看懂该填什么，又不绑死。
 */
export const EMPTY_CONFIG: SyncConfig = { baseUrl: '', userId: '' }

/** 读本机存的配置。存坏了（不是 JSON、缺字段）就当没存过，不抛错 */
export function loadConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return EMPTY_CONFIG
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      userId: typeof parsed.userId === 'string' ? parsed.userId : '',
    }
  } catch {
    return EMPTY_CONFIG
  }
}

export function saveConfig(config: SyncConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

/** 本机记下的游标：下次 GET 的 since。0 表示「从没同步过」 */
export function loadCursor(): number {
  const raw = Number(localStorage.getItem(CURSOR_KEY))
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

export function saveCursor(cursor: number): void {
  localStorage.setItem(CURSOR_KEY, String(Math.max(0, Math.floor(cursor))))
}

// ---------- 请求本体 ----------

/** 响应壳。契约第三节：ok 恒为布尔，data 与 error 只有一个非 null */
interface Envelope<T> {
  ok: boolean
  data: T | null
  error: string | null
}

/**
 * 发一次请求并把响应壳拆开。
 *
 * 🔴 判断「这是不是我方响应」靠的是**有没有 `ok` 字段**，不是 HTTP 状态码。
 *    因为网关自己拦下的错误（路径不匹配、方法不对、预检没放行）返回的是它自己的
 *    JSON，长得像 `{ "errorCode": ..., "errorMessage": ... }` —— 没有 ok。
 *    这时候去读 `body.error` 会得到 undefined，界面上就变成「失败但没原因」。
 *    这条已经在 Day 18 遇到过一次真实请求了。
 */
async function request<T>(path: string, init: RequestInit, config: SyncConfig): Promise<T> {
  const base = config.baseUrl.trim().replace(/\/+$/, '')
  const userId = config.userId.trim()

  if (!base) throw new SyncError('还没填接口地址')
  if (!userId) throw new SyncError('还没填用户编号')

  const headers: Record<string, string> = { 'X-User-Id': userId }
  // GET 不带 body 时不发 Content-Type：省掉一次没必要的预检
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${base}${path}`, { ...init, headers })
  } catch {
    // fetch 只在**网络层**失败时 reject：域名写错、断网、DNS 挂了、
    // 或者被浏览器的 CORS 策略拦下（这时控制台才看得到真正原因）。
    // 注意 4xx/5xx 不会走到这里 —— 它们是「请求成功了，服务器说不行」。
    throw new SyncError(
      '连不上接口 —— 确认地址正确、这台设备能上网，再打开浏览器控制台看有没有跨域报错',
    )
  }

  const raw = await response.text()
  let parsed: unknown = null
  try {
    parsed = raw === '' ? null : JSON.parse(raw)
  } catch {
    // 不是 JSON —— 常见于打到了静态托管（返回的是一个 HTML 404 页）
  }

  if (isEnvelope<T>(parsed)) {
    if (parsed.ok) return parsed.data as T
    throw new SyncError(
      parsed.error ?? '接口返回了失败，但没给原因',
      response.status,
      // 契约第三节：只有 POST 的 400 会在**顶层**多带一个 rejected
      readRejected(parsed),
    )
  }

  // 走到这里说明不是我们的响应壳
  throw new SyncError(
    `接口返回的不是预期格式（HTTP ${response.status}）。` +
      '常见原因：地址少了 /api、打到了静态托管而不是云函数。',
    response.status,
  )
}

function isEnvelope<T>(value: unknown): value is Envelope<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  )
}

/** rejected 挂在顶层、不在 data 里；400 时才有 */
function readRejected(value: unknown): RejectedItem[] {
  const list = (value as { rejected?: unknown }).rejected
  if (!Array.isArray(list)) return []

  return list.flatMap((item): RejectedItem[] => {
    if (typeof item !== 'object' || item === null) return []
    const { index, reason } = item as { index?: unknown; reason?: unknown }
    return [
      {
        index: typeof index === 'number' ? index : -1,
        reason: typeof reason === 'string' ? reason : '（服务端没给原因）',
      },
    ]
  })
}

// ---------- 对外两个动作 ----------

/**
 * 请求体的白名单字段。
 *
 * 🔴 刻意**不**用 `{ ...task }`：契约里 `seq` / `userId` / `createdAt` 三个字段
 *    的赋值权在云端，请求体带了也不该生效。展开写法天然会把它们带上，
 *    而 `seq` 一旦被下游误写，序号就回退 —— 那条记录以后要么反复被拉，
 *    要么再也拉不到，而且**不报错**。
 *    这里正向列字段，多一个都不会漏出去。
 *
 * ⚠️ 本机 Task 目前只有 7 个字段（没有 seq / deletedAt / purgedAt），
 *    所以「移入回收站」这类动作现在发不出去 —— Day 20 补上删除语义时一起加。
 */
function toRow(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    estimateMinutes: task.estimateMinutes,
    importance: task.importance,
    status: task.status,
    // createdAt 在「云端已有这一行」时会被忽略，在「插入新行」时会被采纳 ——
    // 正好是我们想要的：不篡改历史，也不让本机的创建时间丢失。
    createdAt: task.createdAt,
  }
}

/**
 * 推送一批任务。整批一个请求，服务端按「有 id 就 upsert」处理。
 *
 * 契约第七节：允许整批重推 —— 有 id 就是「改」，内容不变，只是 seq 会前进。
 * 所以「错了就再推一次」是安全的，不必做幂等控制。
 */
export async function pushTasks(tasks: Task[], config: SyncConfig): Promise<PushData> {
  if (tasks.length === 0) throw new SyncError('本机没有任务可推')
  return postRows(tasks.map(toRow), config)
}

/**
 * 推送原始行 —— 给「服务端校验自检」用。
 *
 * 存在的理由很具体：前端自己的校验在 createTask 里（空标题直接抛错），
 * 所以正常点按钮**永远不会**发出不合法数据，「服务端也校验了」这件事
 * 就永远得不到证据。这条通路绕开前端校验，专门用来把服务端的拒绝原因问出来。
 *
 * ⚠️ 界面上它是「开发自检」，不是给普通用户用的功能。
 */
export async function postRows(
  rows: Array<Record<string, unknown>>,
  config: SyncConfig,
): Promise<PushData> {
  return request<PushData>('/tasks', { method: 'POST', body: JSON.stringify(rows) }, config)
}

/**
 * 按游标拉变化。
 *
 * cursor 的含义是**下次的 since**，等于「本次返回里最大的 seq」，
 * 不是本区的最大 seq —— 两者在分页时不等价，用错会静悄悄丢数据。
 * 所以这里直接把服务端给的 cursor 存下来，不自己算。
 */
export async function pullSince(since: number, config: SyncConfig): Promise<PullData> {
  return request<PullData>(`/tasks?since=${Math.max(0, Math.floor(since))}`, { method: 'GET' }, config)
}

// ---------- Day 22：改一条 / 删一条 ----------

/** PATCH 成功时 data 的形状（契约第六节第 3 条） */
export interface PatchData {
  cursor: number
  accepted: Array<{ id: string; seq: number; corrected?: boolean; task: RemoteTask }>
  rejected: RejectedItem[]
}

/** DELETE 成功时 data 的形状（契约第六节第 4 条） */
export interface DeleteData {
  cursor: number
  /** 上一次已经删成功过 —— 这是**幂等返回，不是错误** */
  alreadyDeleted: boolean
  deleted: { id: string; seq?: number; deletedAt: string | null }
}

/**
 * 改一条任务。**只改传进来的字段**，没传的保持库里现值。
 *
 * 🔴 别用它来「整条覆盖」：那正是 PUT 的语义，而契约明确不做 PUT ——
 *    因为整份覆盖会把没打算动的字段（含 `seq`）一起写坏。
 *    只传想改的那一两个键，是这个接口唯一正确的用法。
 *
 * ⚠️ id 走路径，**不放在请求体里** —— body 里带 `id` 会被服务端忽略。
 */
export async function patchTask(
  id: string,
  fields: Record<string, unknown>,
  config: SyncConfig,
): Promise<PatchData> {
  return request<PatchData>(
    `/tasks/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
    config,
  )
}

/**
 * 删一条任务（服务端是**软删**：写 `deletedAt`，行留着）。
 *
 * 🔴 返回值里要区分 `alreadyDeleted`：重复删同一条会返回 `true` 而不是报错，
 *    这是幂等设计 —— 用户双击、或网络重试，都不该看到一条红字。
 * ⚠️ 它**不是**彻底删除。把 `purgedAt` 打上的那条路仍然只有「推送」能走。
 */
export async function deleteTaskRemote(id: string, config: SyncConfig): Promise<DeleteData> {
  return request<DeleteData>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }, config)
}

/**
 * 取「当前可用的同步配置」：两个字段都填了才算可用，否则返回 `null`。
 *
 * 界面用它决定「这次删除要不要先问云端」——
 * 没配云端的用户，删除就只是本地删除，不该弹一个「连不上接口」的错。
 */
export function activeConfig(): SyncConfig | null {
  const config = loadConfig()
  return config.baseUrl.trim() && config.userId.trim() ? config : null
}

// ---------- 追加需求（Day 24 之后）：今日预算 ----------
// ⚠️ 这不是课程 Day 25 的内容 —— 那天是「做 verify-project Skill」。

/** 预算接口的 data 形状（契约第六节 5b / 5c 条） */
export interface BudgetData {
  /** 本地日历日 'YYYY-MM-DD' */
  date: string
  /** null = 那天没填过（**不是 0** —— 「今天一分钟都没有」与「还没填」是两回事） */
  minutes: number | null
  updatedAt: string | null
}

/**
 * 读某一天的预算。
 *
 * ⚠️ 日期由**客户端**算好再传，不让服务端自己取「今天」：
 *    服务端在 UTC，用户在 +08:00，晚上 8 点之后两边会差一天，
 *    存进去的预算第二天早上就「不见了」。
 */
export async function fetchBudget(date: string, config: SyncConfig): Promise<BudgetData> {
  return request<BudgetData>(`/budget?date=${encodeURIComponent(date)}`, { method: 'GET' }, config)
}

/**
 * 写某一天的预算。`minutes: null` = 清空那天。
 *
 * 用 POST 而不是 PUT：与 /api/tasks 同一个理由 —— 契约里没有 PUT，
 * 而且这个动作本身就是「有就改、没有就建」的 upsert，正是 POST 的语义。
 */
export async function postBudget(
  date: string,
  minutes: number | null,
  config: SyncConfig,
): Promise<BudgetData> {
  return request<BudgetData>(
    '/budget',
    { method: 'POST', body: JSON.stringify({ date, minutes }) },
    config,
  )
}
