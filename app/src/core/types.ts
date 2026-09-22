// 知先的核心数据类型
//
// 这个文件属于 core/（核心层）：纯 TypeScript，**不依赖 React**。
// 好处是算法和类型能被独立测试，将来转小程序时 UI 重写、这部分直接复用。
//
// 字段依据：TECH_DESIGN.md 第五节「数据模型」。

/** 任务状态：待办 / 进行中 / 已完成 */
export type TaskStatus = 'todo' | 'doing' | 'done'

/** 重要度：1–5 星 */
export type Importance = 1 | 2 | 3 | 4 | 5

/**
 * 任务 —— 知先唯一的核心数据对象。
 *
 * 注意：**派生值不入库**。优先级分数、紧迫度、排序理由都由 core/priority.ts
 * 实时算出，不存进数据库。理由是权重一旦调整，存下来的分数就全过期了。
 */
export interface Task {
  /** 唯一标识，系统生成 */
  id: string
  /** 任务内容 */
  title: string
  /** 截止时间（ISO 格式字符串）；没有期限时为 null */
  dueAt: string | null
  /** 预计耗时（分钟）；未估算时为 null */
  estimateMinutes: number | null
  /** 重要度 1–5，默认 3 */
  importance: Importance
  /** 当前状态 */
  status: TaskStatus
  /** 创建时间（ISO 格式），同分时用来排序 */
  createdAt: string
}

/**
 * 新建任务时要提供的字段。
 *
 * 只有 title 是必填的；id / createdAt / status 由系统生成，
 * 所以不在这个类型里 —— 这样「用户能决定什么」和「系统决定什么」就分清了。
 */
export interface TaskInput {
  title: string
  dueAt?: string | null
  estimateMinutes?: number | null
  importance?: Importance
}

/**
 * 修改任务时允许改的字段。
 *
 * 用 Omit 排掉 id 和 createdAt —— 这两个是身份和时间戳，一旦生成就不该被改。
 */
export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>

/** 创建任务时，重要度的默认值 */
export const DEFAULT_IMPORTANCE: Importance = 3
