// 数据层的唯一出口 —— 「换零件」的那颗螺丝
//
// 上层（界面层 / 业务层）只能从这里拿 taskRepo，**绝不直接 import 具体实现**。
//
// 第 3 周接云端时，只需要改动下面那一行：
//   import { IndexedDbTaskRepository } from './local-indexeddb'
//   → import { CloudBaseTaskRepository } from './cloud-cloudbase'
// 界面层和业务层的代码一行都不用动。这就是技术设计 2.3 节说的「换零件」。

import { IndexedDbTaskRepository } from './local-indexeddb'
import type { TaskRepository } from './repository'

/**
 * 当前生效的任务仓储。
 *
 * 类型标注成 TaskRepository（接口），而不是 IndexedDbTaskRepository（具体实现）——
 * 这个标注本身就是一道约束：从这个变量上只能调用接口里定义的方法，
 * 想用某个实现独有的能力会直接编译报错，从而挡住「偷偷依赖具体实现」。
 */
export const taskRepo: TaskRepository = new IndexedDbTaskRepository()

export type { TaskRepository } from './repository'
