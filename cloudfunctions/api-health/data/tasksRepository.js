/**
 * 数据访问层：tasks 表的全部查询（Day 19 从 index.js 拆出）。
 *
 * 🔴 全项目「跟数据库打交道」的代码只有这一个文件。以后表结构变了、
 *    或者过滤条件要改（比如接登录后不再用请求头里的 user_id），
 *    改这里一处就够 —— 这就是今天做这次重构的目的。
 *
 * ⚠️ 本文件里只有查询，没有任何 HTTP 相关的东西（没有 reply、没有请求头）。
 *    它不知道调用方是 HTTP 云函数还是别的什么。
 */
const { getDb, queryAll } = require('./db')

/**
 * 要返回的列。**写死、不用 `*`**：表将来加列时，接口不会静默多返回一个
 * 契约里没有的字段 —— 与 toTaskDto 逐个字段映射是同一个理由的两面。
 */
const COLUMNS =
  'id,seq,title,due_at,estimate_minutes,importance,status,created_at,deleted_at,purged_at'

/**
 * 🔴 查询层从 `pg` 原生 SQL 换成了 `app.rdb()` 的链式调用（见 getDb）。
 *    对照关系留着 —— 以后要改查询先看这张表，别去控制台乱试：
 *
 *    ① 全量（首次同步）
 *       SQL：SELECT … FROM tasks WHERE user_id = $1 ORDER BY seq ASC LIMIT $2
 *       链：db.from('tasks').select(COLUMNS).eq('user_id', u).order('seq', {ascending:true}).limit(n)
 *
 *    ② 增量（带游标）
 *       SQL：SELECT … FROM tasks WHERE user_id = $1 AND seq > $2 ORDER BY seq ASC LIMIT $3
 *       链：同上，在 .eq() 后面加 .gt('seq', since)
 *
 *    ③ 本区最大 seq
 *       SQL：SELECT COALESCE(MAX(seq), 0) AS max_seq FROM tasks WHERE user_id = $1
 *       链：db.from('tasks').select('seq').eq('user_id', u).order('seq', {ascending:false}).limit(1)
 *
 * ⚠️ ③ 为什么换成「倒序取 1 条」而不是聚合：
 *    1. PostgREST 的聚合（MAX）要额外开函数权限或写个 RPC，免费版不值得折腾；
 *    2. 倒序取 1 条走的是现成的 (user_id, seq) 索引，成本与 MAX 同级；
 *    3. 空表时 data 是空数组 → 取 0，与 COALESCE 的行为完全一致。
 *
 * ⚠️ ② 的 `seq > since` 也必须带 `user_id` 过滤（链上已有 .eq）。
 *    `seq` 是**全局**序列、所有用户共用；漏掉 user_id 会拿到别人的号，
 *    前端把它当游标 → 本区此后记录全拉不到，且不可恢复。
 *
 * ─────────────────────────────────────────────────────────
 * 下面三句 SQL 是上面链式调用的**等价写法**，运行时**不用**。
 * 只留给本地回归脚本 verify-get-tasks.cjs（拿 pglite 真引擎跑一遍
 * 游标/notice 分支）。改链式调用时请同步改这里，否则本地测的是空气。
 */
const SQL_LIST_FULL = `
  SELECT id, seq, title, due_at, estimate_minutes, importance,
         status, created_at, deleted_at, purged_at
  FROM tasks
  WHERE user_id = $1
  ORDER BY seq ASC
  LIMIT $2
`

const SQL_LIST_SINCE = `
  SELECT id, seq, title, due_at, estimate_minutes, importance,
         status, created_at, deleted_at, purged_at
  FROM tasks
  WHERE user_id = $1 AND seq > $2
  ORDER BY seq ASC
  LIMIT $3
`

const SQL_MAX_SEQ = `SELECT COALESCE(MAX(seq), 0) AS max_seq FROM tasks WHERE user_id = $1`

/** 单次最多返回 200 条（契约）。多取 1 条用来判断「还有更多」。 */
const PAGE_SIZE = 200


/** 分批查库时每批的条数：PostgREST 的 `in.(…)` 是拼在 URL 上的，塞太多会超长 */
const IN_BATCH = 100

/** 把数组切成每批 n 个（PostgREST 的 in.(…) 不能太长）。 */
function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}


// ⚠️ 仅供本机验证脚本读取（用真 PostgreSQL 引擎跑一遍游标/notice 分支）。
//    不参与运行时逻辑，删掉也不影响云函数。
//    🔴 那三句 SQL 现在只是链式调用的**等价写法**，运行时不再执行它们 ——
//       改 getDb 那套链式查询时，请把这里同步改掉，否则本地回归测的是空气。

/**
 * ⑥ 个查询函数 —— 这是整个数据访问层的全部出口。
 *
 * 🔴 每个函数都**重新调一次 getDb()**，不复用外部传进来的客户端。
 *    原因见原来 index.js 里那段警告：链式 builder 是**可变对象**，
 *    存成变量复用会让上一次的过滤条件累积到下一次。getDb() 内部有缓存，
 *    反复调用拿的是同一个客户端，不会重复初始化。
 *
 * ⚠️ 所有查询都必须带 `user_id`（除 upsert，它的 user_id 在行数据里）。
 *    `seq` 是**全局**序列、所有用户共用，漏掉过滤会拿到别人的号。
 */

/** ① 全量拉取（首次同步 / 游标失效兜底）。多取 1 条用于判断 hasMore。 */
async function listFull(userId) {
  return queryAll(
    getDb()
      .from('tasks')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('seq', { ascending: true })
      .limit(PAGE_SIZE + 1)
  )
}

/** ② 增量拉取：只要 seq 比游标新的。 */
async function listSince(userId, cursor) {
  return queryAll(
    getDb()
      .from('tasks')
      .select(COLUMNS)
      .eq('user_id', userId)
      .gt('seq', cursor)
      .order('seq', { ascending: true })
      .limit(PAGE_SIZE + 1)
  )
}

/** ③ 本区最大 seq。空表返回 0（与 COALESCE(MAX(seq),0) 等价）。 */
async function maxSeq(userId) {
  const rows = await queryAll(
    getDb()
      .from('tasks')
      .select('seq')
      .eq('user_id', userId)
      .order('seq', { ascending: false })
      .limit(1)
  )
  return rows.length > 0 ? Number(rows[0].seq) : 0
}

/** ④ 按 id 批量查现状 → Map<id, row>。上层要判「是新增还是修改」。 */
async function findByIds(ids, userId) {
  const found = new Map()
  if (ids.length === 0) return found
  for (const batch of chunk(ids, IN_BATCH)) {
    const rows = await queryAll(
      getDb()
        .from('tasks')
        .select('id,title,status,due_at,estimate_minutes,importance,created_at,deleted_at,purged_at')
        .eq('user_id', userId)
        .in('id', batch)
    )
    for (const r of rows) found.set(r.id, r)
  }
  return found
}

/**
 * ⑤ 查这些 id 在**全表**里分别属于谁 → Map<id, user_id>
 *
 * 🔴 为什么要单独查一次（Day 19 实测踩出来的洞）：
 *    `id` 是**全局主键**，但 ④ 的 findByIds 带 `user_id` 过滤。
 *    于是「别的区已经有一条同 id 的行」在本区看起来等于「不存在」→ 走新增分支 →
 *    `INSERT … ON CONFLICT (id) DO UPDATE` 会连 `user_id` 一起覆盖，
 *    **等于把别人的任务整条搬到自己名下**（内容也一起被改掉）。
 *
 *    线上真实踩过：前端推送一份「固定 id 的示例数据」到另一个用户区，
 *    原来那 7 行整体消失、出现在了新区里，而且接口回的是 201 成功。
 *
 *    所以「本区没有」还不够，必须再确认「全表也没有别人的」。
 *    ⚠️ 只在本区查不到的 id 上才查，正常新增（全新 id）时这一句是空转。
 */
async function findIdOwners(ids) {
  const owners = new Map()
  if (ids.length === 0) return owners
  for (const batch of chunk(ids, IN_BATCH)) {
    const rows = await queryAll(getDb().from('tasks').select('id,user_id').in('id', batch))
    for (const r of rows) owners.set(r.id, r.user_id)
  }
  return owners
}

/** ⑥ 判重：同区、未完成、未进回收站、title 去掉首尾空格后相同的那些标题。 */async function findDuplicateTitles(titles, userId) {
  const dup = new Set()
  const list = [...new Set(titles.filter(Boolean))]
  if (list.length === 0) return dup
  for (const batch of chunk(list, 50)) {
    const rows = await queryAll(
      getDb()
        .from('tasks')
        .select('id,title')
        .eq('user_id', userId)
        .neq('status', 'done')
        .is('deleted_at', null)
        .is('purged_at', null)
        .in('title', batch)
    )
    for (const r of rows) dup.add(String(r.title).trim())
  }
  return dup
}

/**
 * ⑦ 写入：一条 upsert 语句（PostgREST 的 INSERT … ON CONFLICT (id) DO UPDATE）。
 * 🔴 一次写完而不是逐条：一次请求 = 一条 SQL 语句 = 天然原子，
 *    这就是契约「在一个事务里写入全部 accepted」在 HTTP 接口下的等价实现。
 */
async function upsertRows(rows) {
  return queryAll(
    getDb().from('tasks').upsert(rows, { onConflict: 'id', defaultToNull: false }).select(COLUMNS)
  )
}

module.exports = {
  COLUMNS,
  PAGE_SIZE,
  IN_BATCH,
  SQL_LIST_FULL,
  SQL_LIST_SINCE,
  SQL_MAX_SEQ,
  listFull,
  listSince,
  maxSeq,
  findByIds,
  findIdOwners,
  findDuplicateTitles,
  upsertRows,
  chunk,
}
