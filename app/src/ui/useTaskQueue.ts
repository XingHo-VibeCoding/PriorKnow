// 队列数据与写操作 —— 主视图三个区块共用的那一个「真相来源」
//
// 依据：PRD 5.1（今日队列 + 今日预算）、5.4（数据与设置）。
//
// 为什么要把「读库 / 算分 / 写操作」从 TodayQueue 里抽出来：
//   今日预算条需要**队列顺序**才能算出「今天做得完几件」；
//   数据与设置里的「导入」「载入示例」写完之后，队列也得跟着刷新。
//   如果这些还关在 TodayQueue 内部，另外两个区块就拿不到，
//   只能靠「子组件往上传」这种别扭做法。抽到 hook 里，三处共享同一份状态。
//
// ⚠️ 这里只认 data/ 出口的 taskRepo 和 core/ 的算法，不碰 IndexedDB 细节。

import { useCallback, useEffect, useMemo, useState } from 'react'
import { taskRepo } from '../data'
import { buildSampleTasks } from '../data/sampleTasks'
import { rankTasks, type QueueEntry } from '../core/priorityQueue'
import type { Task } from '../core/types'
import { describeError } from './format'

/**
 * 数据层的四种演示模式。
 *
 * Day 8 的验收要求「加载中 / 成功 / 空 / 错误四种状态都能看到」。
 * 但本地 IndexedDB 读一次只要几毫秒，「加载中」和「错误」平时根本看不见 ——
 * 状态写在那儿却没人见过，等于没做。所以给一个开关，能把慢和坏主动演出来。
 *
 * Day 11 又加了第四种。原因是同一件事：新做的「处理中」和「失败提示」
 * 在本地库上同样看不见（写一次几毫秒、几乎不会失败），
 * 所以慢速模式连写入一起放慢，「写入失败」单独成为一种模式。
 */
export type DataMode = 'normal' | 'slow' | 'fail' | 'writeFail'

/** 「慢速」模式故意等这么久，好让人看清加载中的样子 */
const SLOW_MS = 2600

/**
 * 慢速模式下**写入**的等待时间。
 *
 * 比读取的 2.6 秒短：读取要让人看清转圈，写入只要让人看清按钮从
 * 「完成」变成「处理中…」—— 看太久反而烦。
 */
const SLOW_WRITE_MS = 1200

/**
 * 一次「完成 / 撤销」之后要浮给用户看的那条提示 —— Day 11 的主角。
 *
 * Day 11 的题目是「用户操作后页面明确回应」。回应拆成三种，三种的**停留时间
 * 和按钮都不一样**，所以必须分开，不能都用一句「操作成功」糊过去：
 *
 *   done   —— 刚完成。这是唯一**可以撤销**的状态，所以带「撤销」按钮、停留 5 秒；
 *   undone —— 已经撤销回来了。事情已经了结，只报一声，2.5 秒就走，不需要按钮；
 *   failed —— 没成功。**绝不自动消失** —— 用户没看见就等于没提示，
 *             而且必须给一个「重试」，让他知道下一步该做什么。
 */
export interface ActionFeedback {
  kind: 'done' | 'undone' | 'failed'
  taskId: string
  title: string
  /** 失败原因。只有 failed 这一种会填 */
  detail: string
  /** failed 时「重试」要重跑哪个操作；其余情况为 null */
  retry: 'complete' | 'undo' | null
}

export interface TaskQueue {
  /** 排好序的待办队列（已算分） */
  ranked: QueueEntry[]
  /** 已完成的任务 */
  done: Task[]
  /** 任务总数（含已完成） */
  total: number
  /** 第一次读库有没有结束 —— 决定显示「加载中」还是内容 */
  loaded: boolean
  /** 有没有写操作正在进行 */
  busy: boolean
  /** 正在写入的那一件。用来把「处理中…」只显示在被点的那张卡上，而不是所有卡片一起变 */
  busyTaskId: string | null
  /** 读 / 写失败的提示。**非空即「错误状态」** */
  error: string
  /** 本次渲染用的「现在」。分数与「还剩几天」都由它算，保证同一屏里自洽 */
  now: Date
  /** 重新读库 + 重置时刻 */
  refresh: () => Promise<void>
  /** 包一层写操作：置忙 → 执行 → 重读 → 队列自动重排。成功返回 true */
  act: (action: () => Promise<unknown>, failureNote: string) => Promise<boolean>
  /** 载入内置示例数据。会清空现有任务，所以内部先弹确认；用户取消返回 false */
  loadSamples: () => Promise<boolean>
  /** 最近一次完成 / 撤销的提示条内容。为 null 表示当前没有提示 */
  feedback: ActionFeedback | null
  /** 标记完成。成功后浮出「可撤销」的提示条 */
  completeTask: (id: string, title: string) => Promise<boolean>
  /** 撤销最近一次完成 —— 任务回到队列，并自动重新算分排位 */
  undoComplete: () => Promise<boolean>
  /** 重跑失败的那一次操作 */
  retryFeedback: () => Promise<boolean>
  /** 关掉提示条 */
  dismissFeedback: () => void
}

export function useTaskQueue(dataMode: DataMode): TaskQueue {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null)

  const refresh = useCallback(async () => {
    // ---- 「失败」模式：不读库，直接给出错误态 ----
    // 这不是假装出错，而是把**真实会发生**的读取失败提前摆出来看：
    // 万一以后真出问题，界面长什么样是早就见过的，不至于当场手忙脚乱。
    if (dataMode === 'fail') {
      setError('读取失败：数据层被「模拟失败」开关拦下了。把开关调回「正常」即可恢复。')
      setLoaded(true)
      return
    }

    // ---- 「慢速」模式：先把加载态露出来，再等一会儿才真读 ----
    if (dataMode === 'slow') {
      setLoaded(false)
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
    }

    try {
      const list = await taskRepo.listTasks()
      setTasks(list)
      setNow(new Date())
      setError('')
    } catch (err) {
      setError('读取失败：' + describeError(err))
    } finally {
      setLoaded(true)
    }
  }, [dataMode])

  // 首次挂载读一次；dataMode 一变（切到慢速 / 失败）也重读，好让状态立刻可见。
  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * 写入前的闸门 —— 两个演示开关都挂在这里。
   *
   * · 慢速模式：**写入也一起放慢**。否则「处理中…」只有几毫秒，
   *   写了等于没写（和 Day 8 给「加载中」加慢速是同一个理由）。
   * · 写入失败模式：把**写入**拦下来，但**读取照常**。
   *   这一点很关键 —— 队列本身还读得出来，用户看到的是
   *   「哪一件没成功、可以重试」，而不是整页变成错误态。
   *   读取失败是另一条路（fail 模式），两者不能混为一谈。
   */
  const gateWrite = useCallback(async () => {
    if (dataMode === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, SLOW_WRITE_MS))
    }
    if (dataMode === 'writeFail') {
      throw new Error('写入被「模拟写入失败」开关拦下了。把开关调回「正常」再试一次。')
    }
  }, [dataMode])

  /**
   * 写操作的统一外壳。
   *
   * 有了它，每个按钮只需要写「做什么」，不用各自重复
   * 「置忙 → try → 重读 → catch → 复位」这一套。更重要的是：
   * **任何一次写入之后都会重读队列**，所以「改完自动重排」是结构性保证，
   * 而不是每个按钮各自记得去调一次刷新。
   */
  const act = useCallback(
    async (action: () => Promise<unknown>, failureNote: string): Promise<boolean> => {
      setBusy(true)
      try {
        await gateWrite()
        await action()
        await refresh()
        return true
      } catch (err) {
        setError(failureNote + '：' + describeError(err))
        return false
      } finally {
        setBusy(false)
      }
    },
    [gateWrite, refresh],
  )

  const total = tasks.length

  const loadSamples = useCallback(async (): Promise<boolean> => {
    // 会覆盖现有数据，所以必须先确认（PRD 5.4 与仓储接口的约定）
    const ok = window.confirm(
      `载入示例数据会清掉现有的 ${total} 件任务，换成 7 件示例。这一步不能撤销，继续？`,
    )
    if (!ok) return false

    return act(() => taskRepo.importAll(buildSampleTasks(new Date())), '载入示例数据失败')
  }, [act, total])

  // 待办：只排没做完的。已完成的不该占着「今天做什么」的位置。
  const ranked = useMemo(
    () => rankTasks(tasks.filter((task) => task.status !== 'done'), now),
    [tasks, now],
  )
  const done = useMemo(() => tasks.filter((task) => task.status === 'done'), [tasks])

  /**
   * 标记完成 —— Day 11 的主交互。
   *
   * ⚠️ 为什么不复用 act()：act 失败时会 setError，而 error 非空会让整个队列
   * 换成「队列没读出来」那一整块错误页。**但写入失败不该把读得好好的队列也换掉** ——
   * 用户遇到的是「这一件没完成」，不是「队列看不见了」。整页报错还会把
   * 「重试」指向重新读库，可读库本来就是好的，按了也没用。
   * 所以这里自己管 busy，失败只走提示条：说清是哪一件、并且能重试。
   */
  const completeTask = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      setBusy(true)
      setBusyTaskId(id)
      try {
        await gateWrite()
        await taskRepo.completeTask(id)
        await refresh()
        setFeedback({ kind: 'done', taskId: id, title, detail: '', retry: null })
        return true
      } catch (err) {
        setFeedback({
          kind: 'failed',
          taskId: id,
          title,
          detail: describeError(err),
          retry: 'complete',
        })
        return false
      } finally {
        setBusy(false)
        setBusyTaskId(null)
      }
    },
    [gateWrite, refresh],
  )

  /**
   * 撤销的实际动作。
   *
   * 撤销 = 把状态改回 todo，所以**数据层一行都不用改** ——
   * updateTask 本来就干这个（repository.ts 里的契约早就留好了）。
   * 改回 todo 之后队列会重新读库、重新算分，任务自己找回它该在的位置。
   *
   * 抽出来是因为两个入口共用它：「撤销」按钮，以及失败后的「重试」。
   * 两者校验条件不同（前者要求提示条正处于 done），动作却是同一个。
   */
  const runUndo = useCallback(
    async (taskId: string, title: string): Promise<boolean> => {
      setBusy(true)
      setBusyTaskId(taskId)
      try {
        await gateWrite()
        await taskRepo.updateTask(taskId, { status: 'todo' })
        await refresh()
        setFeedback({ kind: 'undone', taskId, title, detail: '', retry: null })
        return true
      } catch (err) {
        setFeedback({
          kind: 'failed',
          taskId,
          title,
          detail: describeError(err),
          retry: 'undo',
        })
        return false
      } finally {
        setBusy(false)
        setBusyTaskId(null)
      }
    },
    [gateWrite, refresh],
  )

  /** 只有「刚完成、还没被撤销」的提示条上才谈得上撤销 */
  const undoComplete = useCallback(async (): Promise<boolean> => {
    if (feedback === null || feedback.kind !== 'done') return false
    return runUndo(feedback.taskId, feedback.title)
  }, [feedback, runUndo])

  /** 重跑失败的那一次操作 —— 失败提示条上「重试」按钮的去处 */
  const retryFeedback = useCallback(async (): Promise<boolean> => {
    if (feedback === null || feedback.kind !== 'failed') return false
    return feedback.retry === 'undo'
      ? runUndo(feedback.taskId, feedback.title)
      : completeTask(feedback.taskId, feedback.title)
  }, [completeTask, feedback, runUndo])

  const dismissFeedback = useCallback(() => setFeedback(null), [])

  return {
    ranked,
    done,
    total,
    loaded,
    busy,
    busyTaskId,
    error,
    now,
    refresh,
    act,
    loadSamples,
    feedback,
    completeTask,
    undoComplete,
    retryFeedback,
    dismissFeedback,
  }
}
