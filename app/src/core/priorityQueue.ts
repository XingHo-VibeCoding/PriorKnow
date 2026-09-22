// 优先队列 —— 用二叉堆实现
//
// 依据：TECH_DESIGN 第四节的 `core/priorityQueue.ts`（标注为「优先队列 / 二叉堆（上浮、下沉）」）。
//
// 为什么不用简单的 `.sort()`？
//   几百条任务时，sort 完全够用，选堆不是为了这一天。
//   堆的价值在第 2 周：任务完成一件后，队列只需 O(log n) 调整就能让下一件浮上来
//   （专注模式下「点完成 → 下一个自动顶上来」就是这个操作），
//   而每次重新 sort 一遍是 O(n log n)。数据量越大，差距越明显。
//
// 本文件属于 core/：纯 TypeScript，不依赖 React。

import { computePriority, type PriorityResult } from './priority'
import type { Task } from './types'

/** 队列里的一项：任务本身 + 它的算分结果 */
export interface QueueEntry {
  task: Task
  priority: PriorityResult
}

/**
 * 比较两项谁更该排在前面。**这是「分段排」落地的地方。**
 *
 * 返回负数 = a 在前；正数 = b 在前；0 = 完全等价（正常不会出现）。
 *
 * 排序键依次是：
 *   1. **紧不紧急** —— 紧急的全排在前面；
 *   2. 分数高的在前；
 *   3. 创建早的在前（同分时先来先做）；
 *   4. id 兜底 —— 保证任意两项都能分出先后，让排序结果稳定可复现。
 *
 * ⚠️ 第 1 条用的判据是 `isUrgent`（紧迫度 > 0，即「已逾期或 7 天内到期」），
 * **不是**「有没有填截止时间」。这个区别很关键：
 *
 *   用户提过一个真实场景 —— 「很渴望做但没设期限」的任务，
 *   对上「6 个月后才到期、重要性不高」的任务。
 *   若按「有没有填日期」分段，后者会因为填了个日期就插到前面，
 *   而它的紧迫度其实是 0 分 —— 分数公式已经认定它不紧急，
 *   分段规则却把它当紧急处理，两处判断打架，出现「16.7 分排在 50 分前面」。
 *   改用 isUrgent 后，分段与算分共用 urgencyOf()，只有一个真相来源。
 *
 * 第 4 条不是多余的：PRD 的 F3 要求「每个位置都能看出前后关系，
 * 不出现并列含糊」，所以比较函数必须是个**全序**，不能有「相等但顺序随缘」的情况 ——
 * 否则同一批数据两次排序可能给出不同顺序，用户会以为算法坏了。
 */
export function compareEntries(a: QueueEntry, b: QueueEntry): number {
  // 1. 紧急的优先（已逾期或 7 天内到期）
  if (a.priority.isUrgent !== b.priority.isUrgent) {
    return a.priority.isUrgent ? -1 : 1
  }

  // 2. 分数高的在前
  if (a.priority.score !== b.priority.score) {
    return b.priority.score - a.priority.score
  }

  // 3. 创建早的在前
  if (a.task.createdAt !== b.task.createdAt) {
    return a.task.createdAt < b.task.createdAt ? -1 : 1
  }

  // 4. id 兜底，保证全序
  if (a.task.id === b.task.id) return 0
  return a.task.id < b.task.id ? -1 : 1
}

/** 把任务数组直接算成队列项数组 */
export function toEntries(tasks: Task[], now: Date = new Date()): QueueEntry[] {
  return tasks.map((task) => ({ task, priority: computePriority(task, now) }))
}

/**
 * 二叉堆优先队列。
 *
 * 用一个数组存完全二叉树：下标 i 的左右孩子是 2i+1 和 2i+2，父节点是 (i-1)/2。
 * 这样不需要真的建树，靠下标算术就能在数组上「上下爬」。
 */
export class PriorityQueue {
  private heap: QueueEntry[] = []

  private readonly compare: (a: QueueEntry, b: QueueEntry) => number

  constructor(compare: (a: QueueEntry, b: QueueEntry) => number = compareEntries) {
    this.compare = compare
  }

  /** 队列里有多少项 */
  get size(): number {
    return this.heap.length
  }

  get isEmpty(): boolean {
    return this.heap.length === 0
  }

  /**
   * 从一堆任务建队列。
   *
   * 用**自底向上**的建堆法（从最后一个非叶节点开始逐个下沉），复杂度 O(n)；
   * 而「一个一个 push」是 O(n log n)。数据量大时差别可观，写法也不复杂，就用前者。
   */
  static fromTasks(
    tasks: Task[],
    now: Date = new Date(),
    compare: (a: QueueEntry, b: QueueEntry) => number = compareEntries,
  ): PriorityQueue {
    const queue = new PriorityQueue(compare)
    queue.heap = toEntries(tasks, now)
    queue.heapify()
    return queue
  }

  /** 看一眼优先级最高的那项，但不取走 */
  peek(): QueueEntry | null {
    return this.heap.length > 0 ? this.heap[0] : null
  }

  /**
   * 取出优先级最高的那项（出队）。
   *
   * 做法：先记下堆顶，再把数组末尾那项搬到堆顶，然后让它**下沉**回到该在的位置。
   * 这样只动了两个位置，不用把整个数组往前挪。
   */
  pop(): QueueEntry | null {
    if (this.heap.length === 0) return null

    const top = this.heap[0]
    const last = this.heap.pop() as QueueEntry

    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }

    return top
  }

  /** 放入一项。做法是把新项放末尾，再让它**上浮**到该在的位置。 */
  push(entry: QueueEntry): void {
    this.heap.push(entry)
    this.siftUp(this.heap.length - 1)
  }

  /**
   * 取出全部，按优先级从高到低返回。
   * ⚠️ 是破坏性的：调完之后队列就空了。
   */
  drain(): QueueEntry[] {
    const result: QueueEntry[] = []
    let item = this.pop()
    while (item !== null) {
      result.push(item)
      item = this.pop()
    }
    return result
  }

  /**
   * 不动队列，返回一份排好序的快照。
   * 界面渲染用这个（渲染不该破坏数据结构）。
   */
  toSortedArray(): QueueEntry[] {
    return [...this.heap].sort(this.compare)
  }

  // ---------- 堆的两个基本动作 ----------

  /** 自底向上建堆 */
  private heapify(): void {
    // 从最后一个「有孩子的节点」开始往前，逐个下沉
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) {
      this.siftDown(i)
    }
  }

  /**
   * 上浮：把 index 处的元素往上提，直到它不比父节点更优先。
   *
   * 用「先挖坑、最后填」的写法：先把待提的元素存起来，
   * 沿途把父节点往下挪，找到位置后再填回去。比每次交换少一半赋值。
   */
  private siftUp(index: number): void {
    const node = this.heap[index]

    while (index > 0) {
      const parentIndex = (index - 1) >> 1
      const parent = this.heap[parentIndex]

      // 已经不比父节点更优先，就停
      if (this.compare(node, parent) >= 0) break

      this.heap[index] = parent
      index = parentIndex
    }

    this.heap[index] = node
  }

  /**
   * 下沉：把 index 处的元素往下放，直到它比两个孩子都更优先。
   *
   * 每一步都在「左右孩子里更优先的那个」和「自己」之间选 ——
   * 若孩子更优先就换上去，自己继续往下走。
   */
  private siftDown(index: number): void {
    const size = this.heap.length
    const node = this.heap[index]

    for (;;) {
      const leftIndex = index * 2 + 1
      if (leftIndex >= size) break // 没有孩子了，到底了

      const rightIndex = leftIndex + 1

      // 先在左右孩子里挑出更优先的那个
      let childIndex = leftIndex
      if (rightIndex < size && this.compare(this.heap[rightIndex], this.heap[leftIndex]) < 0) {
        childIndex = rightIndex
      }

      // 孩子都不比自己优先，就停
      if (this.compare(this.heap[childIndex], node) >= 0) break

      this.heap[index] = this.heap[childIndex]
      index = childIndex
    }

    this.heap[index] = node
  }
}

/**
 * 一步到位：给一堆任务，返回排好序的队列项。
 *
 * 界面最常要的就是这个 —— 拿全部任务、算分、按优先级排好。
 * 内部走「建堆 → 逐个出队」，得到的顺序就是最终顺序。
 */
export function rankTasks(tasks: Task[], now: Date = new Date()): QueueEntry[] {
  return PriorityQueue.fromTasks(tasks, now).drain()
}
