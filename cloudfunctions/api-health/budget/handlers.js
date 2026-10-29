/**
 * 业务层：今日预算的两个接口（追加需求 —— Day 24 之后提的，不属于课程 Day 25）。
 *
 *   GET  /api/budget?date=2026-10-30   → 那天的预算（没有就是 minutes: null）
 *   POST /api/budget  { date, minutes } → 写入；minutes 传 null 表示清空那天
 *
 * 职责边界与 tasks/handlers.js 一致：读请求头 → 校验 → 调数据层 → 拼响应。
 * 🔴 这里不该出现 `db.from(...)` —— 查询全在 data/budgetRepository.js。
 *
 * 为什么单独一个资源、而不是塞进 tasks 表存成一条特殊任务：
 *   预算是**设置**，不是任务。塞进 tasks 会让「全部任务」页多出一条没有标题的怪行，
 *   也会让同步（增量拉取、回收站、墓碑）多一类它根本不该参与的生命周期。
 *   一张两列的表比这些副作用便宜得多。
 */
const { reply, readHeader } = require('../http/reply')
const { INTERNAL_ERROR } = require('../messages')
const { getDb } = require('../data/db')
const budgetRepo = require('../data/budgetRepository')
// 🔴 ID 规则只有一处定义（tasks/validate.js），这里直接引用而不是抄一份 ——
//    抄一份的下场是「接口放行了、数据库拒了」，报出来还是 500 而不是 400。
const { ID_FORMAT } = require('../tasks/validate')

/** 保留最近多少天。更早的清掉（那已经没人会回头看，见 budgetRepository.purgeOlderThan） */
const KEEP_DAYS = 30

/** 一天的分钟数上限 —— 与 db/migrate-03-budget.sql 的 CHECK 同一条规则 */
const MAX_MINUTES = 1440

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/

/** X-User-Id 的读取与校验。规则与 tasks 侧完全一致。 */
function readUserId(rawHeaders) {
  const raw = readHeader(rawHeaders, 'x-user-id')
  const userId = typeof raw === 'string' ? raw.trim() : ''
  if (!userId) return { error: '缺少 X-User-Id 请求头' }
  if (!ID_FORMAT.test(userId)) {
    return { error: 'X-User-Id 格式不对（只能 1–64 位字母、数字、下划线或连字符）' }
  }
  return { userId }
}

/**
 * 判日期。返回一句人话的错，或者 null。
 *
 * 🔴 光有正则不够：`2026-02-31` 完全符合 /^\d{4}-\d{2}-\d{2}$/，但它不存在。
 *    这里靠「构造出来再读回去」判真伪 —— Date 会把 2 月 31 日**悄悄**归一化成 3 月 3 日，
 *    读回来的月/日与原值不一致，就说明用户写的日子不存在。
 */
function judgeDate(value) {
  if (typeof value !== 'string' || value === '') return '缺少日期（形如 date=2026-10-30）'
  if (!DATE_FORMAT.test(value)) return '日期要写成 2026-10-30 这种形式'
  const [year, month, day] = value.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return '这个日期不存在（月份超出 1–12，或那一天在当月没有）'
  }
  return null
}

/**
 * 判分钟数。`null` 是合法的，含义是「清空这一天」。
 *
 * ⚠️ 与判断「字段缺没缺」分开：`minutes: undefined`（没这个键）是错误，
 *    `minutes: null`（显式清空）是意图。用 `in` 判，不用真值判 ——
 *    否则 `0` 和 `null` 会被混成同一种情况。
 */
function judgeMinutes(value) {
  if (value === null) return { minutes: null }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { error: 'minutes 必须是数字（清空请传 null）' }
  }
  if (!Number.isInteger(value)) return { error: 'minutes 要填整数分钟' }
  if (value <= 0) return { error: 'minutes 要大于 0（不想填就传 null 清空）' }
  if (value > MAX_MINUTES) {
    return { error: `minutes 不能超过 ${MAX_MINUTES}（一天只有这么多分钟）` }
  }
  return { minutes: value }
}

// ════════════════════════════════════════════════════════════
//  GET /api/budget?date=YYYY-MM-DD
// ════════════════════════════════════════════════════════════

async function handleGetBudget(searchParams, rawHeaders) {
  const who = readUserId(rawHeaders)
  if (who.error) return reply(400, { ok: false, data: null, error: who.error })

  const date = String(searchParams.get('date') || '').trim()
  const badDate = judgeDate(date)
  if (badDate) return reply(400, { ok: false, data: null, error: badDate })

  // 连不上库与查库出错要分开说：前者是「环境没起来」，后者是「我们写错了」
  try {
    getDb()
  } catch (err) {
    console.error('[GET /api/budget] app.rdb() 初始化失败：', err && err.message)
    return reply(500, { ok: false, data: null, error: '服务器连不上数据库，请稍后再试' })
  }

  try {
    const row = await budgetRepo.findOne(who.userId, date)
    return reply(200, {
      ok: true,
      data: {
        date,
        // 没填过时给 null 而不是 0 —— 界面要区分「今天一分钟都没有」和「还没填」
        minutes: row ? Number(row.minutes) : null,
        updatedAt: row ? row.updated_at : null,
      },
      error: null,
    })
  } catch (err) {
    console.error('[GET /api/budget] 查询失败：', err && err.message, err && (err.dbCode || err.code))
    return reply(500, { ok: false, data: null, error: INTERNAL_ERROR })
  }
}

// ════════════════════════════════════════════════════════════
//  POST /api/budget   { "date": "2026-10-30", "minutes": 180 | null }
// ════════════════════════════════════════════════════════════

async function handlePostBudget(event, rawHeaders) {
  const who = readUserId(rawHeaders)
  if (who.error) return reply(400, { ok: false, data: null, error: who.error })

  // 🔴 请求体在第一个参数 `event`（顶层对象），不在 httpContext 里 ——
  //    与 POST /api/tasks 同一条约定，见那边更长的注释。
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return reply(400, {
      ok: false,
      data: null,
      error: '请求体必须是一个对象：{ "date": "2026-10-30", "minutes": 180 }',
    })
  }

  const date = typeof event.date === 'string' ? event.date.trim() : ''
  const badDate = judgeDate(date)
  if (badDate) return reply(400, { ok: false, data: null, error: badDate })

  if (!('minutes' in event)) {
    return reply(400, {
      ok: false,
      data: null,
      error: '缺少 minutes（要清空就显式传 null）',
    })
  }
  const judged = judgeMinutes(event.minutes)
  if (judged.error) return reply(400, { ok: false, data: null, error: judged.error })

  try {
    getDb()
  } catch (err) {
    console.error('[POST /api/budget] app.rdb() 初始化失败：', err && err.message)
    return reply(500, { ok: false, data: null, error: '服务器连不上数据库，请稍后再试' })
  }

  try {
    // ── 清空 ──────────────────────────────────────────────
    if (judged.minutes === null) {
      await budgetRepo.removeOne(who.userId, date)
      return reply(200, {
        ok: true,
        data: { date, minutes: null, updatedAt: null },
        error: null,
      })
    }

    // ── 写入（同一天有就改）──────────────────────────────
    const row = await budgetRepo.upsertOne(who.userId, date, judged.minutes)

    // 顺手清掉太老的（惰性清理）。🔴 清理失败**不能**让这次写入变成失败 ——
    // 数据已经写进去了，报错只会让客户端以为没保存而重试。
    try {
      await budgetRepo.purgeOlderThan(who.userId, KEEP_DAYS)
    } catch (cleanupErr) {
      console.error('[POST /api/budget] 旧数据清理失败（不影响本次写入）：', cleanupErr && cleanupErr.message)
    }

    return reply(200, {
      ok: true,
      // ⚠️ row 理论上一定有；万一 SDK 没回显，用请求里的值兜底，别给前端 null
      data: {
        date,
        minutes: row ? Number(row.minutes) : judged.minutes,
        updatedAt: row ? row.updated_at : null,
      },
      error: null,
    })
  } catch (err) {
    console.error('[POST /api/budget] 写入失败：', err && err.message, err && (err.dbCode || err.code))
    return reply(500, { ok: false, data: null, error: INTERNAL_ERROR })
  }
}

module.exports = { handleGetBudget, handlePostBudget, judgeDate, judgeMinutes, MAX_MINUTES, KEEP_DAYS }
