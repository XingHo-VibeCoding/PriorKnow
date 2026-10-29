// 今日预算的存取 —— 本机缓存 + 云端
//
// 分工：
//   本文件       = 「这笔预算存在哪儿、谁赢」的判断
//   cloud-sync   = 只会发请求，不知道有没有本机缓存
//   TodayBudget  = 只管显示成什么样
//
// 🔴 为什么本机也要存一份：云端要联网、要配接口地址，而预算条是首页第一眼的东西。
//    没有本机缓存的话，断网或没配地址时预算就永远是空的 —— 那不是「同步」，
//    那是「把本地功能砍了换成云端功能」。
//
// 冲突规则（只有一条，别加复杂逻辑）：
//    云端有值 → 以云端为准（云端是跨设备的真相源）
//    云端没有、本机有 → 把本机值补推上去（多半是上次没同步成功）
//    云端读失败 → 用本机值，同时把错误交出去让界面说一句，**不弹窗、不阻塞**

import { activeConfig, fetchBudget, postBudget } from './cloud-sync'

/** 本机缓存格式：只留「最近一次填的那一天」—— 隔天日期对不上就等于没填过 */
interface StoredBudget {
  date: string
  minutes: number
}

const STORAGE_KEY = 'priorknow.budget'

/** 一天最多 1440 分钟。与 db/migrate-03-budget.sql 的 CHECK 同一个数 */
export const MAX_MINUTES = 1440

/**
 * 今天（**本地**日历日）的 'YYYY-MM-DD'。
 *
 * 🔴 不能用 toISOString().slice(0,10)：那是 UTC 日期。
 *    在东八区，晚上 8 点之后 UTC 已经是「明天」，预算会被存到明天那一格，
 *    第二天打开就发现昨天填的没了。
 */
export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 读本机缓存。日期对不上（隔天了）或存坏了，都当没填过。 */
export function readLocalBudget(date: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<StoredBudget>
    if (parsed.date !== date) return null
    const minutes = Number(parsed.minutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return null
    return Math.round(minutes)
  } catch {
    return null
  }
}

/** 写本机缓存。minutes 为 null = 清掉（隐私模式写不进去也不该让页面报错）。 */
export function writeLocalBudget(date: string, minutes: number | null): void {
  try {
    if (minutes === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, minutes }))
  } catch {
    // 预算是锦上添花，写不进去不抛
  }
}

/** 值从哪来 —— 界面用它决定那句小字怎么写 */
export type BudgetSource = 'cloud' | 'local' | 'none'

export interface BudgetLoadResult {
  minutes: number | null
  source: BudgetSource
  /** 云端读失败时的原始异常（交给 ui/errors.ts 解释）；没去读或读成功时为 null */
  cloudError: unknown
}

/**
 * 载入某一天的预算：先看本机，再问云端。
 *
 * 永远不会抛异常 —— 云端出问题也要返回本机值，让预算条照常能用。
 */
export async function loadBudget(date: string): Promise<BudgetLoadResult> {
  const local = readLocalBudget(date)
  const config = activeConfig()

  // 没配接口地址 = 这个用户没在用云端，不该提示「同步失败」
  if (config === null) {
    return { minutes: local, source: local === null ? 'none' : 'local', cloudError: null }
  }

  try {
    const data = await fetchBudget(date, config)

    if (data.minutes !== null) {
      writeLocalBudget(date, data.minutes)
      return { minutes: data.minutes, source: 'cloud', cloudError: null }
    }

    // 云端没有这一天：本机有就补推一次（多半是上次写到一半断了网）
    if (local !== null) {
      try {
        await postBudget(date, local, config)
      } catch {
        // 补推失败不打断：值已经在本机，界面照常用，下次改的时候会再试
      }
      return { minutes: local, source: 'local', cloudError: null }
    }

    return { minutes: null, source: 'none', cloudError: null }
  } catch (err) {
    return { minutes: local, source: local === null ? 'none' : 'local', cloudError: err }
  }
}

export interface BudgetSaveResult {
  /** 真的写到云端了吗 */
  synced: boolean
  /** 云端写失败时的原始异常；没配地址（本来就不打算同步）时为 null */
  cloudError: unknown
}

/**
 * 保存某一天的预算：**先写本机、再推云端**。
 *
 * 顺序不能反：反过来断网时用户敲的数字会直接消失，
 * 而本机写是同步的、几乎不会失败。
 */
export async function saveBudget(date: string, minutes: number | null): Promise<BudgetSaveResult> {
  writeLocalBudget(date, minutes)

  const config = activeConfig()
  if (config === null) return { synced: false, cloudError: null }

  try {
    await postBudget(date, minutes, config)
    return { synced: true, cloudError: null }
  } catch (err) {
    return { synced: false, cloudError: err }
  }
}
