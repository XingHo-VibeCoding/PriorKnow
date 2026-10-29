// 错误提示的统一收口 —— Day 23
//
// 为什么值得单独一个文件：
//
//   在这之前，「把异常变成一句话」这件事散在 6 个地方，写法都是
//   `'某某失败：' + describeError(err)`，而 describeError 只是取 `error.message`。
//   问题在于 message 是**谁抛的谁写的**：
//     · 我们自己的校验（任务内容不能为空）→ 中文，用户看得懂；
//     · 浏览器 / IndexedDB 抛的 → 英文。
//   最难看的一种：写库时超配额，用户看到「保存失败：QuotaExceededError」——
//   既不知道发生了什么，也不知道接下来干什么。
//
//   更要紧的是：这三种失败**该告诉用户的事完全不同**。
//     ① 输入错   —— 你能改，告诉我改哪一个字
//     ② 网络错   —— 先确认地址填对、这台设备能上网
//     ③ 服务端错 —— 服务器说不行，把它的原话摆出来（别翻译成"操作失败"）
//   用同一句「操作失败」收尾，等于三种都没说。
//
// 所以这个文件只干一件事：**看异常长什么样，判断它属于哪一类，给一句人话**。
// 判断顺序是固定的，且不猜 —— 见 classify 的注释。

import { SyncError } from '../data/cloud-sync'
import { ValidationError } from '../data/errors'

/**
 * 错误分类。
 *
 * 前三种是课程 Day 23 明确要求的三类；后两种是这套代码里真实会出现的，
 * 硬塞进前三类会让文案说错话（把「存储满了」说成「你输入错了」），
 * 所以宁可多两类，也不含糊。
 */
export type ErrorKind =
  /** 用户填的东西有问题，改了就能过 */
  | 'input'
  /** 请求没走到服务器：地址错、断网、跨域被拦 */
  | 'network'
  /** 服务器收到了、明确说不行 */
  | 'server'
  /** 本机浏览器的存储层出错（配额满、库版本旧、事务被打断…） */
  | 'local'
  /** 上面四类都不是 —— 多半是代码 bug，需要原文才能定位 */
  | 'unknown'

/** 界面上的小标签。短，是因为它要和正文排在同一行 */
export const ERROR_LABELS: Record<ErrorKind, string> = {
  input: '输入问题',
  network: '网络问题',
  server: '服务端问题',
  local: '本机数据',
  unknown: '未预料的问题',
}

/** 一条解释好的错误。界面上直接摊开这三样 */
export interface ExplainedError {
  kind: ErrorKind
  /** 小标签，例如「网络问题」 */
  label: string
  /** 一句话，直接能读 */
  text: string
}

/**
 * 本机存储层的错误名 → 一句能照着做的话。
 *
 * 这些名字来自 IndexedDB 规范（`DOMException.name`），Dexie 会原样往上抛。
 * 只列**这个应用真可能撞上**的几种：全列出来反而是噪音。
 */
const STORAGE_HINTS: Record<string, string> = {
  QuotaExceededError:
    '浏览器分给这个站点的存储空间满了。先「导出 JSON」备份，再删掉一些不用的任务，然后重试。',
  VersionError:
    '这台设备的浏览器里存着一个更旧版本的本地库。刷新一次页面；还不行就是浏览器版本太老，换一个再试。',
  AbortError:
    '写入被中途打断了 —— 常见原因是另一个标签页同时在改这批数据。关掉多余的标签页，再试一次。',
  ConstraintError: '和库里已有的记录撞了（同一条任务被写了两遍）。刷新列表后重试。',
  DataError: '要存的内容类型不对 —— 多半是某个数值字段被填成了文字。检查后重试。',
  NotFoundError: '要改的那条记录已经不在本地库里了。刷新列表看看它是不是被删了。',
  InvalidStateError: '浏览器把这个本地库的连接关掉了。刷新页面即可恢复。',
  DataCloneError: '要存的内容里有浏览器存不下的东西（通常是普通对象里塞了函数或 DOM 节点）。',
  UnknownError: '浏览器没说明原因地拒绝了这次存储操作。刷新页面再试；反复出现就把这句话截图反馈。',
}

/**
 * 把任意异常翻成一句人话。
 *
 * @param error    catch 到的东西。可能是 Error、DOMException、字符串，甚至 undefined。
 * @param context  可选前缀，用来补「是哪一件事失败了」，例如「删除「交报告」失败」。
 *                 有它的时候最终文案是「<context>：<人话>」。
 */
export function explainError(error: unknown, context?: string): ExplainedError {
  let body: ExplainedError

  try {
    body = classify(error)
  } catch {
    // 兜底：连分类本身都炸了（比如异常的 name 属性是个会抛错的 getter）。
    // 这时候绝不能再往上抛 —— 报错路径上再报错，用户看到的就是白屏。
    body = {
      kind: 'unknown',
      label: ERROR_LABELS.unknown,
      text: '出错了，但这个错误本身也读不出来。刷新页面再试一次。',
    }
  }

  const prefix = context?.trim()
  return prefix ? { ...body, text: `${prefix}：${body.text}` } : body
}

/**
 * 直接造一个「输入问题」。
 *
 * 表单里的前置校验（标题为空、耗时填了负数）根本不会走到数据层，
 * 没有异常可翻，但它对用户来说**就是**同一类事 —— 所以走同一个标签、
 * 同一套排版，而不是另起一种说法。
 */
export function inputError(text: string): ExplainedError {
  return { kind: 'input', label: ERROR_LABELS.input, text }
}

// ---------- 分类本体 ----------

/**
 * 判断顺序（**不能换**）：
 *
 *   ① SyncError            —— 它自己知道是网络还是服务端，别再猜
 *   ② 存储错误名            —— DOMException.name 是标准值，可靠
 *   ③ ValidationError       —— 我们自己抛的，天然是「输入问题」
 *   ④ 其他中文 Error         —— 本机数据层的问题（如「任务不存在」）
 *   ⑤ 剩下的一律 unknown    —— 英文原文不直接给用户看，但也不吞掉
 *
 * 🔴 为什么不先看 HTTP 状态码就完事：`SyncError` 的 `status === 0` 覆盖了
 *    两种完全不同的情况 ——「连不上」（网络）和「配置没填全」（其实是输入）。
 *    两者都给「检查网络」，用户会去重启路由器，而真正该做的是把地址填上。
 */
function classify(error: unknown): ExplainedError {
  if (error instanceof SyncError) return fromSync(error)

  const name = readName(error)
  const hint = name === '' ? undefined : STORAGE_HINTS[name]
  if (hint !== undefined) {
    return { kind: 'local', label: ERROR_LABELS.local, text: hint }
  }

  if (error instanceof ValidationError) {
    return inputError(readMessage(error))
  }

  const message = readMessage(error).trim()

  // 有中文 = 我们自己写的文案，已经是人话，原样用。
  // 走到这里的多半是数据层的「任务不存在」这类 —— 归到「本机数据」，
  // 因为它要用户做的是「刷新一下」，不是「改输入」。
  if (message !== '' && hasChinese(message)) {
    return { kind: 'local', label: ERROR_LABELS.local, text: message }
  }

  // 英文原文 / 空 message。原文附在括号里 ——
  // 用户看不懂，但截图发过来能直接定位到是哪个浏览器 API 炸的。
  const raw = message !== '' ? message : name !== '' ? name : '没有可读的错误信息'
  return {
    kind: 'unknown',
    label: ERROR_LABELS.unknown,
    text: `出错了，原因不在前面几类里（${raw}）。刷新页面再试；反复出现就把这句话截图反馈。`,
  }
}

/** SyncError 自带状态码，按「请求到底走到哪一步」分，不按数字大小硬编码 */
function fromSync(error: SyncError): ExplainedError {
  // status 0 = fetch 阶段就 reject 了，一个字节都没发出去或者没收到
  if (error.status === 0) {
    // 但「地址/编号没填」是 SyncError 里另一种 status 0 —— 那是用户该去补的输入
    if (NO_INPUT.test(error.message)) {
      return { kind: 'input', label: ERROR_LABELS.input, text: `${error.message}。在下面「云端同步」里补上再点。` }
    }
    return { kind: 'network', label: ERROR_LABELS.network, text: error.message }
  }

  // 4xx / 5xx：服务器明确回复了。原因用它的原话 —— 翻译会丢信息
  const status = `HTTP ${error.status}`
  if (error.status >= 500) {
    return {
      kind: 'server',
      label: ERROR_LABELS.server,
      // 服务端已经说了「发生了什么」（全站只有一句，在 cloudfunctions 的 messages.js 里），
      // 这里只补「不是你操作的问题」。这句必须由前端说 ——
      // 用户看到失败的第一反应是「我填错了」，于是反复去改输入，
      // 而只有前端知道这次是 5xx 而不是 4xx，这句话才说得有依据。
      // ⚠️ 别在这里再补「稍后再试」：服务端那句话里已经有了，一句劝两遍很啰嗦。
      text: `${error.message}（${status}）—— 不是你操作的问题。`,
    }
  }
  return {
    kind: 'server',
    label: ERROR_LABELS.server,
    text: `服务端拒绝了这次请求（${status}）：${error.message}`,
  }
}

/** SyncError 里「其实是输入没填」的两种 message（见 data/cloud-sync.ts 的 request） */
const NO_INPUT = /还没填|没有任务可推/

/** 读异常的名字。getter 可能抛错，所以整段包起来 */
function readName(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    try {
      const name = (error as { name?: unknown }).name
      if (typeof name === 'string') return name
    } catch {
      return ''
    }
  }
  return ''
}

/** 读异常的 message：Error、DOMException、字符串，都要能读出来 */
function readMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error !== null) {
    try {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string') return message
    } catch {
      return ''
    }
  }
  return error === undefined || error === null ? '' : String(error)
}

/** 判断有没有汉字 —— 用来区分「我们的文案」和「浏览器的英文原文」 */
function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text)
}
