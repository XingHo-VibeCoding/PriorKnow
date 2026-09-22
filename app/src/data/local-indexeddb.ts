// IndexedDB 实现 —— 第 1–2 周真正干活的数据层
//
// 依据：TECH_DESIGN.md 第 3.3 节（选 IndexedDB）、第六节（接口契约）。
//
// 这个文件是「数据层接口」的第一个实现。第 3 周会新增一个 CloudBase 实现，
// 两个实现长在同一个接口上，上层代码不用改。
//
// 需要知道的背景：IndexedDB 是浏览器内置的数据库，但它的原生 API 又长又绕
// （要手工开事务、监听事件）。Dexie.js 是对它的一层封装，用起来接近普通 JS 数组操作。

import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_IMPORTANCE, type Importance, type Task, type TaskInput, type TaskPatch } from '../core/types'
import type { TaskRepository } from './repository'

/**
 * 数据库本体。
 *
 * `tasks!: EntityTable<Task, 'id'>` 的意思是：这张表存 Task，
 * 主键字段叫 id。Dexie 靠这行知道你操作的是什么数据。
 */
class PriorKnowDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>

  constructor() {
    super('priorknow')

    this.version(1).stores({
      // 第一个字段是主键，其余是建了索引的字段。
      // 建索引是为了将来能快速按状态、截止时间筛选，不影响存取正确性。
      tasks: 'id, status, dueAt, importance, createdAt',
    })
  }
}

/** IndexedDB 版的任务仓储 */
export class IndexedDbTaskRepository implements TaskRepository {
  private readonly db = new PriorKnowDatabase()

  async listTasks(): Promise<Task[]> {
    const rows = await this.db.tasks.toArray()
    return rows.map(copyTask)
  }

  async getTask(id: string): Promise<Task | null> {
    const task = await this.db.tasks.get(id)
    // 按契约：找不到返回 null，不抛错
    return task ? copyTask(task) : null
  }

  async createTask(input: TaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) {
      throw new Error('任务内容不能为空')
    }

    // id / status / createdAt 三个字段由系统生成，不由调用方决定
    const task: Task = {
      id: newId(),
      title,
      dueAt: input.dueAt ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      importance: input.importance ?? DEFAULT_IMPORTANCE,
      status: 'todo',
      createdAt: new Date().toISOString(),
    }

    await this.db.tasks.add(task)
    return copyTask(task)
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task> {
    const existing = await this.db.tasks.get(id)
    if (!existing) {
      throw new Error(`任务不存在：${id}`)
    }

    // 先合并，再把 id / createdAt 钉回原值 —— 这两个字段不该被 patch 改掉
    const merged: Task = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
    }

    merged.title = merged.title.trim()
    if (!merged.title) {
      throw new Error('任务内容不能为空')
    }

    await this.db.tasks.put(merged)
    return copyTask(merged)
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.tasks.delete(id)
  }

  async completeTask(id: string): Promise<Task> {
    // 标记完成就是「改状态」，所以复用 updateTask，不重写一遍逻辑
    return this.updateTask(id, { status: 'done' })
  }

  async exportAll(): Promise<Task[]> {
    const rows = await this.db.tasks.toArray()
    // 深拷贝一份再给出去：导出的数据是要被用户带走的，
    // 不应该和内存里的对象还连着同一份引用。
    return structuredClone(rows)
  }

  async importAll(tasks: Task[]): Promise<void> {
    // 先逐条校验并规范化。任何一条不合法就在这里抛错，
    // 此时数据库**还没动过** —— 满足 TECH_DESIGN 第八节「原数据不动」。
    const normalized = tasks.map((task, index) => normalizeImported(task, index))

    // 清空 + 写入放进同一个事务：要么全成功，要么全不动。
    // 否则万一清完一半失败，用户的数据就两头不着地了。
    await this.db.transaction('rw', this.db.tasks, async () => {
      await this.db.tasks.clear()
      if (normalized.length > 0) {
        await this.db.tasks.bulkAdd(normalized)
      }
    })
  }
}

// ---------- 内部工具 ----------

/** 浅拷贝一份任务。字段全是基本类型，浅拷贝就够，避免调用方改到库里的对象。 */
function copyTask(task: Task): Task {
  return { ...task }
}

/**
 * 生成唯一 id。
 *
 * `crypto.randomUUID()` 需要「安全上下文」（https 或 localhost）。
 * 本地开发走 localhost，够用；万一环境不满足就退回时间戳 + 随机串。
 */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 把重要度夹在 1–5 之间，容忍外部传进来的越界值 */
function clampImportance(value: unknown): Importance {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_IMPORTANCE
  const clamped = Math.min(5, Math.max(1, n))
  return clamped as Importance
}

/**
 * 校验并规范化一条「导入」的任务。
 *
 * 导入的数据来自用户手上的 JSON 文件，可能是手改过的、缺字段的、甚至不是任务。
 * 所以这里逐字段兜底，而不是直接信任。
 */
function normalizeImported(raw: unknown, index: number): Task {
  const position = `第 ${index + 1} 条`

  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${position}不是有效的任务对象`)
  }

  const source = raw as Partial<Task>

  if (typeof source.title !== 'string' || !source.title.trim()) {
    throw new Error(`${position}缺少有效的任务内容（title）`)
  }

  return {
    id: typeof source.id === 'string' && source.id ? source.id : newId(),
    title: source.title.trim(),
    dueAt: typeof source.dueAt === 'string' ? source.dueAt : null,
    estimateMinutes:
      typeof source.estimateMinutes === 'number' && Number.isFinite(source.estimateMinutes)
        ? source.estimateMinutes
        : null,
    importance: clampImportance(source.importance),
    status: source.status === 'doing' || source.status === 'done' ? source.status : 'todo',
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString(),
  }
}
