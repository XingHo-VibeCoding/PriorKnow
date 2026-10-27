/**
 * 业务层：两个接口的流程编排（Day 19 从 index.js 拆出）。
 *
 * 职责边界：读请求头 → 调校验 → 调数据访问层 → 拼响应。
 * 🔴 这里**不该再出现** `db.from(...)` —— 所有查询都在 data/tasksRepository.js。
 */
const { reply, readHeader } = require('../http/reply')
const { getDb } = require('../data/db')
const tasksRepo = require('../data/tasksRepository')
const { PAGE_SIZE } = tasksRepo
const { MAX_BATCH, ID_FORMAT, judgeOne } = require('./validate')
const { toTaskDto, buildRow } = require('./mapper')

// ════════════════════════════════════════════════════════════
//  GET /api/tasks —— Day 17 新增
//  契约：docs/规格/api-contract.md 第一节第 1 个接口
// ════════════════════════════════════════════════════════════

async function handleGetTasks(searchParams, rawHeaders) {
  // ── ① 校验 X-User-Id ────────────────────────────────
  const userIdRaw = readHeader(rawHeaders, 'x-user-id')
  const userId = typeof userIdRaw === 'string' ? userIdRaw.trim() : ''
  if (!userId) {
    return reply(400, { ok: false, data: null, error: '缺少 X-User-Id 请求头' })
  }
  // 与 db/schema.sql 的 CHECK 同一条规则（1–64 且只含 [A-Za-z0-9_-]）。
  // ⚠️ 必须是同一个正则 —— 两道校验规则不一致时，会出现
  //    「接口放行了、数据库拒了」，报出来是一个 500 而不是 400。
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    return reply(400, { ok: false, data: null, error: 'X-User-Id 格式不对（只能 1–64 位字母、数字、下划线或连字符）' })
  }

  // ── ② 校验 since ────────────────────────────────────
  const sinceRaw = searchParams.get('since')
  let since = null
  if (sinceRaw !== null && sinceRaw !== '') {
    // 负数、小数、字母、科学计数法全部不匹配
    if (!/^\d+$/.test(sinceRaw)) {
      return reply(400, { ok: false, data: null, error: 'since 不是合法的游标（必须是大于等于 0 的整数）' })
    }
    since = Number(sinceRaw)
  }

  // ── ③ 查本区最大 seq，决定这次是全量还是增量 ──────────
  // ⚠️ 这里只做一次「能不能连上库」的探测，具体查询交给数据访问层。
  //    保留这个 try/catch 是为了不改行为：连不上库时文案是「连不上数据库」，
  //    而查询出错时是「服务器内部错误」—— 两者对用户的意义不同，不能合并。
  try {
    getDb()
  } catch (err) {
    // 连不上库时给一句人话，而不是把 SDK 的英文异常抛给前端。
    // 真正的原因（缺凭证 / envId 取不到 / 依赖没装）打在函数日志里。
    console.error('[GET /api/tasks] app.rdb() 初始化失败：', err && err.message)
    return reply(500, {
      ok: false,
      data: null,
      error: '服务器连不上数据库，请稍后再试',
    })
  }

  try {
    // ③-a 本区最大 seq（数据访问层内部是「倒序取 1 条」，等价于 COALESCE(MAX(seq),0)）
    const maxSeq = await tasksRepo.maxSeq(userId)

    let notice = null
    let rows

    if (since === null) {
      // 首次同步：全量
      rows = await tasksRepo.listFull(userId)
    } else if (since > maxSeq) {
      // 本地游标比云端还新 → 当全量（契约唯一能检出的那种「游标失效」）
      rows = await tasksRepo.listFull(userId)
      notice = '已重新拉取全量数据'
    } else {
      // 正常增量
      rows = await tasksRepo.listSince(userId, since)

      // 🔴 契约第六节：`since == max(seq)` 且 items 为空 → 当作全量。
      //    这是 Day 16 评审挑出的漏洞：云端被整体重建（重跑 seed / 墓碑清空）后
      //    seq 会从头开始，「seq > since」为空，而 `since > max` 又不成立，
      //    客户端会以为「云端没变化」，两端永久不一致且不报错。
      //    ⚠️ 必须是「等于」AND「空」两个条件同时成立 ——
      //    items 非空时不能触发，否则每次都会白拉一遍全量。
      if (rows.length === 0 && since === maxSeq) {
        rows = await tasksRepo.listFull(userId)
        notice = '已重新拉取全量数据'
      }
    }

    // ── ④ 组装响应 ────────────────────────────────────
    const hasMore = rows.length > PAGE_SIZE
    // ⚠️ 必须先截断、再算 cursor。反过来算的话 cursor 会变成第 201 条的 seq，
    //    前端下次 since=它 → 第 201 条**永远不会被拉到**（静默丢数据）。
    const items = rows.slice(0, PAGE_SIZE).map(toTaskDto)

    // cursor = 本次 items 里最大的 seq（不是本区最大 seq —— 那会跳数据）。
    // items 为空时沿用请求带的 since；首次同步且库为空时为 0。
    const cursor = items.length > 0 ? items[items.length - 1].seq : (since === null ? 0 : since)

    return reply(200, {
      ok: true,
      data: { items, cursor, hasMore, notice },
      error: null,
    })
  } catch (err) {
    // 🔴 不把堆栈或英文异常抛给前端（契约第二节错误表最后一行）。
    //    但**要打到函数日志**，否则线上出问题只能靠猜。
    console.error('[GET /api/tasks] 查询失败：', err && err.message, err && (err.dbCode || err.code))
    return reply(500, { ok: false, data: null, error: '服务器内部错误，请稍后再试' })
  }
}

// ════════════════════════════════════════════════════════════
//  POST /api/tasks —— Day 18 新增
//  契约：docs/规格/api-contract.md 第三节第 2 个接口
// ════════════════════════════════════════════════════════════

async function handlePostTasks(event, rawHeaders) {
  // ── ① X-User-Id（与 GET 同一条规则，同一个正则）──────────────
  const userIdRaw = readHeader(rawHeaders, 'x-user-id')
  const userId = typeof userIdRaw === 'string' ? userIdRaw.trim() : ''
  if (!userId) {
    return reply(400, { ok: false, data: null, error: '缺少 X-User-Id 请求头' })
  }
  if (!ID_FORMAT.test(userId)) {
    return reply(400, { ok: false, data: null, error: 'X-User-Id 格式不对（只能 1–64 位字母、数字、下划线或连字符）' })
  }

  // ── ② 请求体：必须是数组 ────────────────────────────────────
  // 🔴 请求体在**第一个参数 `event`**，不在 `httpContext` 里 ——
  //    httpContext 只有 url / httpMethod / headers（读 functions-framework 的
  //    build/middlewares/context.js 确认）。框架用 koa-body 解析 JSON，
  //    顶层是数组时会原样给到 event（不是包一层 { body: [...] }）。
  if (!Array.isArray(event)) {
    return reply(400, { ok: false, data: null, error: '请求体必须是一个任务数组', rejected: [] })
  }
  if (event.length === 0) {
    return reply(400, { ok: false, data: null, error: '没有要推送的内容', rejected: [] })
  }
  if (event.length > MAX_BATCH) {
    return reply(400, { ok: false, data: null, error: `一次最多推送 ${MAX_BATCH} 条，请分批`, rejected: [] })
  }

  // ── ③ 第一遍：逐条判定，这一遍完全不碰数据库 ─────────────────
  // 契约「先校验、后写入」：把所有能判的都在内存里判完，
  // 避免「写一条提交一条」导致「第 3 条失败但前 2 条已提交」。
  const rejected = []
  const candidates = []
  for (let i = 0; i < event.length; i++) {
    const judged = judgeOne(event[i], i)
    if (judged.reject) rejected.push(judged.reject)
    else candidates.push(judged.item)
  }

  if (candidates.length === 0) {
    // 一条都没过校验 → 连库都不用开
    return reply(400, { ok: false, data: null, error: '所有条目都没通过校验', rejected })
  }

  // ── ④ 第二遍：查这些 id 在库里的现状（决定「插入」还是「更新」）──
  try {
    getDb()
  } catch (err) {
    console.error('[POST /api/tasks] app.rdb() 初始化失败：', err && err.message)
    return reply(500, { ok: false, data: null, error: '服务器连不上数据库，请稍后再试' })
  }

  try {
    // id → 库里那一行（数据访问层内部按 100 个一批查）
    const existing = await tasksRepo.findByIds([...new Set(candidates.map((c) => c.id))], userId)

    // ── ⑤ 分成「新增」和「修改」，并处理墓碑 ────────────────────
    const toInsert = []
    const toUpdate = []
    for (const c of candidates) {
      const cur = existing.get(c.id)
      if (cur && cur.purged_at !== null && cur.purged_at !== undefined) {
        // 墓碑：契约要求「这个任务已被彻底删除，不能恢复」
        rejected.push({ index: c.index, field: 'id', reason: '这个任务已被彻底删除，不能恢复' })
        continue
      }
      if (cur) toUpdate.push(c)
      else toInsert.push(c)
    }

    // purge 一个库里不存在的 id：没有行可以打墓碑，直接拒（不然会插进一行空壳）
    //
    // 🔴 还要先排掉「这个 id 在**别的区**里已经存在」的情况（Day 19 实测踩出来的洞）。
    //    `id` 是全局主键，而上面 findByIds 带了 user_id 过滤 → 别人的行在本区看来
    //    等于「不存在」→ 走新增分支 → upsert 的 ON CONFLICT 分支会连 user_id
    //    一起覆盖，**把别人的任务整条搬到自己名下**，接口还回 201 成功。
    //    文案沿用契约 404 那句「找不到这个任务」—— 不能回「它属于别人」，
    //    那等于确认这个编号存在，泄露别人的数据有无（同契约「404 与 403 合并」的理由）。
    const owners =
      toInsert.length > 0
        ? await tasksRepo.findIdOwners(toInsert.map((c) => c.id))
        : new Map()

    const inserts = []
    for (const c of toInsert) {
      const owner = owners.get(c.id)
      if (owner !== undefined && owner !== userId) {
        rejected.push({ index: c.index, field: 'id', reason: `找不到这个任务（编号 ${c.id}）` })
        continue
      }
      if (c.purge) {
        rejected.push({ index: c.index, field: 'id', reason: `找不到这个任务（编号 ${c.id}）` })
        continue
      }
      // 🔴 新增必须带 title —— 但这条判定**只能放在这里**，不能放进 judgeOne：
      //    修改时「不给 title」是完全合法的（意思是不改标题，沿用库里原值），
      //    而"这一条到底是新增还是修改"要查过库才知道。
      //    第一遍 judgeOne 是纯内存判定，它看到的只是一条没有 title 的对象，
      //    那时候拒掉，会把「只改个状态」这种正常请求一起打死。
      //    ⚠️ 线上实测过：漏了这条，缺 title 的新增会一路漏到数据库，
      //       变成 NOT NULL 约束报错 → 500（本该是干净的 400 + rejected）。
      if (c.provided.title === undefined) {
        rejected.push({ index: c.index, field: 'title', reason: '新增任务必须带 title' })
        continue
      }
      inserts.push(c)
    }

    // ── ⑥ 判重：只对「新增」做（契约：同区、未完成、未进回收站、title 去空格后相同）──
    // ⚠️ 修改不判重 —— 「把一条 done 改回 todo」会被自己挡住。
    const dupSet = await tasksRepo.findDuplicateTitles(
      inserts.map((c) => c.provided.title),
      userId
    )

    const acceptedInputs = []
    let hasDuplicate = false
    for (const c of [...inserts, ...toUpdate]) {
      if (!existing.has(c.id) && dupSet.has(c.provided.title)) {
        hasDuplicate = true
        rejected.push({
          index: c.index,
          field: 'title',
          reason: '相同标题的待办已经存在（这条没写入）',
        })
        continue
      }
      acceptedInputs.push(c)
    }

    // 排序：让 accepted 的顺序跟请求里的顺序一致，便于前端对账
    acceptedInputs.sort((a, b) => a.index - b.index)
    rejected.sort((a, b) => a.index - b.index)

    if (acceptedInputs.length === 0) {
      // 一条都没落库：重复提交给 409，纯校验失败给 400
      const status = hasDuplicate ? 409 : 400
      return reply(status, {
        ok: false,
        data: null,
        error: hasDuplicate ? '相同标题的待办已经存在' : '所有条目都没通过校验',
        rejected,
      })
    }

    // ── ⑦ 写入：一条 upsert 语句（PostgREST 的 INSERT … ON CONFLICT (id) DO UPDATE）──
    // 🔴 为什么一次写完而不是逐条：一次请求 = 一条 SQL 语句 = 天然原子，
    //    这就是契约「在【一个事务】里写入全部 accepted」在 HTTP 接口下的等价实现。
    const rows = acceptedInputs.map((c) => buildRow(c, existing.get(c.id), userId))

    const written = await tasksRepo.upsertRows(rows)

    const writtenById = new Map(written.map((w) => [w.id, w]))
    const accepted = acceptedInputs
      .map((c) => {
        const w = writtenById.get(c.id)
        if (!w) return null
        const one = { id: w.id, seq: Number(w.seq) }
        if (c.corrected) one.corrected = true
        one.task = toTaskDto(w)
        return one
      })
      .filter(Boolean)

    // cursor = 推送后本区的最大 seq（这些行刚被推到最新，取它们里的最大值即可）
    const maxSeq = accepted.reduce((m, a) => (a.seq > m ? a.seq : m), 0)

    // ── ⑧ 服务端日志（一条，成功路径）──────────────────────────────────
    // 目的：出问题时能从日志一眼看出「这次推送到底发生了什么」，
    //       而不是只能靠前端 Console 猜。
    // 🔴 只记**数量与编号**，不记标题 —— 日志会留存，标题是用户内容，不该进去。
    const createdCount = acceptedInputs.filter((c) => !existing.has(c.id)).length
    console.log(
      '[POST /api/tasks] 成功',
      JSON.stringify({
        user: userId,
        received: event.length,
        created: createdCount,
        updated: accepted.length - createdCount,
        rejected: rejected.length,
        cursor: maxSeq,
      })
    )

    return reply(201, {
      ok: true,
      data: { cursor: maxSeq, accepted, rejected },
      error: null,
    })
  } catch (err) {
    // 🔴 不把堆栈或英文异常抛给前端；但**必须打到日志**，否则线上只能靠猜。
    //    查日志的正确命令（`tcb fn log` 在本环境返回 No invocation logs 是坏的，别用）：
    //      tcb logs search -e <envId> --limit 20
    //      tcb logs search -e <envId> -q 'function_name:"api-health" AND log:"写入失败"'
    console.error('[POST /api/tasks] 写入失败：', err && err.message, err && (err.dbCode || err.code))
    return reply(500, { ok: false, data: null, error: '服务器内部错误，请稍后再试' })
  }
}

module.exports = { handleGetTasks, handlePostTasks }
