/**
 * 数据访问层：daily_budget 表的全部查询。
 *
 * 与 tasksRepository.js 同一套约定：
 *   · 只有查询，没有任何 HTTP 相关的东西（没有 reply、没有请求头）
 *   · 每次查询都重新调 `getDb()`（链式 builder 是**可变对象**，复用会把上次的过滤条件带过来）
 *   · 查询结果一律过 `queryAll()` —— `app.rdb()` 失败时 resolve 出 { error }，不抛异常
 */
const { getDb, queryAll } = require('./db')

/** 写死列名，不用 `*`：表将来加列时接口不会静默多返回一个契约里没有的字段 */
const COLUMNS = 'user_id,on_date,minutes,updated_at'

/**
 * ① 取某一天的那一行。
 *
 * 返回 null = 那天没填过（不是错误）。
 * ⚠️ `.eq('on_date', date)` 传的是 'YYYY-MM-DD' 字符串，PG 的 date 列能直接比；
 *    不要自己转成 Date 对象再传 —— 那会带进时区，跨零点就错一天。
 */
async function findOne(userId, date) {
  const rows = await queryAll(
    getDb()
      .from('daily_budget')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('on_date', date)
      .limit(1)
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * ② 写入（同一天有就改、没有就插）。
 *
 * `onConflict: 'user_id,on_date'` 是**复合主键**，逗号分隔 ——
 * 主键是两列，只写 user_id 会让 PostgREST 找不到唯一的冲突目标而报错。
 */
async function upsertOne(userId, date, minutes) {
  const rows = await queryAll(
    getDb()
      .from('daily_budget')
      .upsert(
        [{ user_id: userId, on_date: date, minutes, updated_at: new Date().toISOString() }],
        { onConflict: 'user_id,on_date' }
      )
      .select(COLUMNS)
  )
  return rows.length > 0 ? rows[0] : null
}

/**
 * ③ 删掉某一天（用户把预算清空时走这里）。
 *
 * ⚠️ 为什么不「写 0 分」代替删除：`daily_budget_minutes_chk` 不允许 0，
 *    而且 0 分与「没填」在语义上不是一回事 —— 前者是「今天一分钟都没有」，
 *    后者是「还没告诉我」。界面要区分这两种，所以只能删行。
 */
async function removeOne(userId, date) {
  return queryAll(getDb().from('daily_budget').delete().eq('user_id', userId).eq('on_date', date))
}

/**
 * ④ 惰性清理：只保留最近 N 天。
 *
 * 为什么是「写入时顺手清」而不是定时任务：
 *   免费版环境没有定时触发器可用（见契约第五节墓碑清理那段的同一理由），
 *    而一个人一天最多写一次预算 —— 写入时清一次的开销可以忽略。
 *
 * ⚠️ 用 UTC 算日期边界，只影响「哪一天算过期」这种误差一天的判断，
 *    不影响正确性；比自己拼字符串本地时区换算可靠。
 */
async function purgeOlderThan(userId, days) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  return queryAll(
    getDb().from('daily_budget').delete().eq('user_id', userId).lt('on_date', cutoffDate)
  )
}

module.exports = { COLUMNS, findOne, upsertOne, removeOne, purgeOlderThan }
