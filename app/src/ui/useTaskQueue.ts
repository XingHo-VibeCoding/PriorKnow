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
 * 数据层的三种演示模式。
 *
 * Day 8 的验收要求「加载中 / 成功 / 空 / 错误四种状态都能看到」。
 * 但本地 IndexedDB 读一次只要几毫秒，「加载中」和「错误」平时根本看不见 ——
 * 状态写在那儿却没人见过，等于没做。所以给一个开关，能把慢和坏主动演出来。
 */
export type DataMode = 'normal' | 'slow' | 'fail'

/** 「慢速」模式故意等这么久，好让人看清加载中的样子 */
const SLOW_MS = 2600

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
}

export function useTaskQueue(dataMode: DataMode): TaskQueue {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

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
    [refresh],
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

  return { ranked, done, total, loaded, busy, error, now, refresh, act, loadSamples }
}
