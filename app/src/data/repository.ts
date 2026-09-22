// 数据层接口（契约）—— 整个项目最关键的接缝
//
// 依据：TECH_DESIGN.md 第 2.3 节与第六节。
//
// 这个文件里**没有一行实现**，只有「有哪些方法、收什么、返回什么」。
// 界面层和业务层只认这个接口，绝不直接碰 IndexedDB 或云数据库。
//
// 为什么这么设计（技术设计 2.3 原话）：
//   第 1–2 周：接口背后挂 IndexedDB 实现；
//   第 3 周：接口背后再挂一个 CloudBase 实现；
//   **整个 28 天，接口本身与上层代码不动。**
// 第 3 周的工作量因此从「重写应用」变成「换一个零件」。

import type { Task, TaskInput, TaskPatch } from '../core/types'

/**
 * 任务仓储接口。
 *
 * ⚠️ 所有方法都返回 Promise（都要 await），**即使本地实现其实可以同步返回**。
 *
 * 这不是多此一举：第 3 周的 CloudBase 实现要走网络，网络天生是异步的。
 * 如果现在图省事写成同步方法，第 3 周换实现时上层每一处调用都得回头改 ——
 * 那就毁掉了「换零件」的设计。现在统一异步，未来零改动。
 */
export interface TaskRepository {
  /** 读取全部任务 */
  listTasks(): Promise<Task[]>

  /** 读取单个任务；不存在时返回 null（不抛错） */
  getTask(id: string): Promise<Task | null>

  /** 新增任务。id / createdAt / status 由实现内部生成 */
  createTask(input: TaskInput): Promise<Task>

  /** 修改任务；成功后返回改完的完整任务 */
  updateTask(id: string, patch: TaskPatch): Promise<Task>

  /** 删除任务 */
  deleteTask(id: string): Promise<void>

  /** 标记任务为已完成；返回改完的完整任务 */
  completeTask(id: string): Promise<Task>

  /** 导出全部任务（对应 PRD 的 F8 导出功能） */
  exportAll(): Promise<Task[]>

  /** 导入并覆盖全部任务。⚠️ 会清掉原有数据，调用前必须让用户确认 */
  importAll(tasks: Task[]): Promise<void>
}
