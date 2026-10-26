/**
 * /api/health —— PriorKnow 第一个云函数（Day 15）。
 *
 * 课程要求只有一句话（计划第 1262–1264 行）：
 *   「只实现 GET /api/health，不连数据库、不写任何业务逻辑；
 *     返回 { "ok": true, "service": "【项目英文名】" }」
 *
 * ─────────────────────────────────────────────────────────
 * ✅ 最终可用地址（2026-10-05 19:37 实测，8/8 连续成功）：
 *
 *   https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api/health
 *   → 200 {"ok":true,"service":"priorknow","time":"..."}
 *
 * ⚠️ **部署后第一次请求可能返回 400 FUNCTIONS_PARAM_INVALID，
 *    紧接着第二次就正常了** —— 网关路由生效有短暂窗口。
 *    → **判断成功要看「连续两次都 200」，别只试一次就下结论。**
 *    （我在这里栽过：单测一次看到 400，差点把「health 是保留路径」这个
 *      **错误结论**写进文档。真相是路由生效时序问题。）
 *
 * 🔴 排查过程中踩过的两个坑（都不是代码问题，记下来省得重蹈）：
 *
 *   1️⃣ **`health` 不是保留路径** —— 我曾这么以为，证据是同一部署下
 *      `/api/health` 报 400 而 `/api/tasks` 正常。但那批400 是**首次请求**的时序问题；
 *      稳定后 `/api/health` 一直 200。**别用单次探测下「平台限制」的结论。**
 *
 *   2️⃣ **`--path` 与 `cloudbaserc.json` 的 `gatewayPath` 不要同时用**：
 *      两者都会创建路由，冲突时路由绑定会坏（表现为 FUNCTIONS_PARAM_INVALID）。
 *      → **只用 `gatewayPath: "/api"`（写在配置文件里，可复现、跨机器一致）**，
 *        `tcb fn deploy` 时**不要**再传 `--path`。
 *
 * ─────────────────────────────────────────────────────────
 * ⚠️ 这个入口的形状是**实测出来的，不是照文档抄的**，过程值得记：
 *
 * 1️⃣ 第一版用 Node 内置 `http` 自己 listen(9000)：
 *    本地 5 个用例全过、部署成功，但**公网 /api/health 永远返回
 *    网关错误 FUNCTIONS_PARAM_INVALID**，而 /api/tasks 却能进函数。
 *    → 「本地能跑」不等于「云端能跑」：入口层跟网关的约定对不上。
 *
 * 2️⃣ 换官方推荐的 functions-framework 后，连踩三个坑：
 *    · 漏装 `@cloudbase/node-sdk` → 框架报「Provided module can't be loaded」
 *    · 以为框架提供 `app.http()` → 报 `app.http is not a function`
 *    · 以为请求信息在 `event` 上 → 实际 `event` 是**空对象**
 *    最后是**打探针打印 event / context 的键名**才定下来。
 *
 * ⚠️ **教训**（两条，以后写云函数直接照用）：
 *   A. 用第三方框架前先读它包内的 `build/*.d.ts`，**别按 Express 风格猜 API**。
 *   B. 拿不准参数在哪就**打探针**：临时把 `Object.keys()` 打印出来跑一次，
 *      比「猜十次」快，也比「读半小时文档」确定。
 *
 * ── 请求信息在哪（探针实测结论）───────────────────────────
 *   context.httpContext.httpMethod  → "GET" / "POST" ...
 *   context.httpContext.url         → 完整 URL（**含查询串**）
 *   context.httpContext.headers     → 请求头
 *   event                           → 空对象（HTTP 场景下不用它）
 *
 * ── 路径怎么算的（实测证据）────────────────────────────────
 * 网关会剥掉访问路径的前缀再转发给函数：
 *   访问 /api/health  →  函数里看到的是 .../health
 *   访问 /api/tasks   →  函数里看到的是 .../tasks
 * （证据：访问 /api/tasks 时，函数回显的 path 就是 "/tasks"）
 * 但**两种写法都判一下**，本地直连时前缀不会被剥掉。
 *
 * ── 响应怎么写 ────────────────────────────────────────────
 * 官方《functions-typings》定义的返回类型是 `IntegrationResponse`：
 *   { statusCode, headers, body }
 * **返回这个对象即可设置状态码** —— HTTP 场景下拿不到 res，不要去碰。
 */

exports.main = async (event, context) => {
  const http = (context && context.httpContext) || {}

  const method = String(http.httpMethod || 'GET').toUpperCase()

  // ⚠️ 这里踩过一个坑：`httpContext.url` 拿到的是**完整 URL**
  //（本地实测值形如 `http://127.0.0.1:9004/health?ts=1`），
  // 不是只含路径的 `/health`。所以不能只 split('?')——
  // 那样切出来的"路径"还带着 `http://主机` 前缀，路由永远匹配不上。
  //
  // 稳妥写法：先用 new URL() 解析；解析失败（理论上不该发生）再退回手工切。
  const rawUrl = String(http.url || '/')
  let path = rawUrl
  try {
    path = new URL(rawUrl, 'http://localhost').pathname
  } catch {
    // 极端兜底：url 不是合法 URL 时，至少把协议和查询串切掉
    path = rawUrl.replace(/^[a-z]+:\/\/[^/]*/i, '').split('?')[0].split('#')[0]
  }
  // 结尾斜杠去掉：/health/ 与 /health 视为同一个接口
  path = path.replace(/\/+$/, '') || '/'

  const isHealth =
    path === '/health' || path === '/api/health' || path === '/ping' || path === '/api/ping'

  // ── CORS 预检：OPTIONS 放行 204（Day 17 按契约第四节加）──────
  // 🔴 为什么必须有：`X-User-Id` 是自定义请求头，浏览器会把所有 /api/tasks
  //    请求当成「非简单请求」，先发一个 OPTIONS 预检。若这里回 405，
  //    预检失败 → 真正的 GET 根本发不出去，而报错是浏览器控制台的
  //    CORS 错误、不是接口错误，排查时极难定位。
  //    ⚠️ 它必须排在下面的 405 判断**之前**。
  if (method === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Headers': 'Content-Type, X-User-Id',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    }
    // 契约第四节：`Access-Control-Allow-Origin` **不要用 `*`**。
    // 没配 CORS_ORIGIN 时**不发这个头**（同源直接打开 JSON 不受影响），
    // 而不是退回 `*` —— 「看起来能跨域」比「明确不行」更危险。
    if (process.env.CORS_ORIGIN) {
      headers['Access-Control-Allow-Origin'] = process.env.CORS_ORIGIN
    }
    return replyRaw(204, headers, '')
  }

  // ── 路由分派 ────────────────────────────────────────
  const isTasks = path === '/tasks' || path === '/api/tasks'

  if (method === 'GET') {
    if (isHealth) {
      // ⚠️ Day 15 这里是 `{ ok, service, time }`（缺 data / error）。
      //    契约第七节「不一致 1」写着「Day 17 实现第一个业务接口时一起改并重新验收」——
      //    今天就是那天。课程第 1478 行也明说「所有接口都不例外」。
      return reply(200, {
        ok: true,
        data: {
          // 项目英文名。课程模板要求填项目英文名，我用仓库名 priorknow。
          service: 'priorknow',
          // ⚠️ 课程模板里没有这一项，是我加的。
          //    作用：验证时刷新一次看 time 变没变 —— 变了才说明是函数实时算出来的，
          //    不是缓存页或静态文件。觉得多余可以删掉，不影响其他部分。
          time: new Date().toISOString(),
        },
        error: null,
      })
    }

    // ── GET /api/tasks —— 契约第一节第 1 个接口（Day 17）──────────
    // 网关会把 `/api` 前缀剥掉，所以这里看到的是 `/tasks`；
    // 本地直连时前缀不会被剥，所以两种都判（与 health 同一写法）。
    if (isTasks) {
      let url
      try {
        url = new URL(rawUrl, 'http://localhost')
      } catch {
        url = new URL('http://localhost/')
      }
      return await handleGetTasks(url.searchParams, http.headers)
    }

    // 契约外路径一律 404
    return reply(404, { ok: false, data: null, error: '没有这个接口' })
  }

  // ── POST /api/tasks —— 契约第三节第 2 个接口（Day 18）──────────
  if (method === 'POST') {
    if (isTasks) return await handlePostTasks(event, http.headers)
    // 契约里登记过的才写，契约外的不写
    return reply(404, { ok: false, data: null, error: '没有这个接口' })
  }

  // ── 其余方法：明确 405，不悄悄返回 200 ────────────────────
  // 悄悄返回 200 会让调试变难。PATCH / DELETE 在 Day 22 才做。
  return reply(
    405,
    { ok: false, data: null, error: `这个接口不支持 ${method} 请求` },
    { Allow: 'GET, POST, OPTIONS' }
  )
}

/**
 * 统一出口：返回官方定义的 IntegrationResponse。
 *
 * body 传对象框架也能序列化，但显式 JSON.stringify 更可控 ——
 * 能保证 Content-Type 与实际内容一致，不依赖框架的猜测。
 */
function reply(statusCode, body, extraHeaders) {
  return replyRaw(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(extraHeaders || {}),
  }, JSON.stringify(body))
}

/** 原样返回（用于 204 这种没有 body 的响应）。 */
function replyRaw(statusCode, headers, body) {
  return { statusCode, headers, body }
}

// ════════════════════════════════════════════════════════════
//  GET /api/tasks —— Day 17 新增
//  契约：docs/规格/api-contract.md 第一节第 1 个接口
// ════════════════════════════════════════════════════════════

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
  let db
  try {
    db = getDb()
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

  // ⚠️ 每次查询都要 `db.from('tasks')` **重新起一个 builder**。
  //    链式对象是**可变**的（每次 .eq() 都往同一个 URL 上追加参数），
  //    如果把它存成变量复用，上一次的 since 会累积到下一次，查询条件会越跑越歪。
  const fetchAll = () =>
    queryAll(
      db
        .from('tasks')
        .select(COLUMNS)
        .eq('user_id', userId)
        .order('seq', { ascending: true })
        .limit(PAGE_SIZE + 1)
    )

  const fetchSince = (cursor) =>
    queryAll(
      db
        .from('tasks')
        .select(COLUMNS)
        .eq('user_id', userId)
        .gt('seq', cursor)
        .order('seq', { ascending: true })
        .limit(PAGE_SIZE + 1)
    )

  try {
    // ③-a 本区最大 seq。等价于 SELECT COALESCE(MAX(seq),0) … WHERE user_id=$1，
    //      只是换成「倒序取 1 条」——理由见文件上半部分的对照表。
    const maxRows = await queryAll(
      db
        .from('tasks')
        .select('seq')
        .eq('user_id', userId)
        .order('seq', { ascending: false })
        .limit(1)
    )
    const maxSeq = maxRows.length > 0 ? Number(maxRows[0].seq) : 0

    let notice = null
    let rows

    if (since === null) {
      // 首次同步：全量
      rows = await fetchAll()
    } else if (since > maxSeq) {
      // 本地游标比云端还新 → 当全量（契约唯一能检出的那种「游标失效」）
      rows = await fetchAll()
      notice = '已重新拉取全量数据'
    } else {
      // 正常增量
      rows = await fetchSince(since)

      // 🔴 契约第六节：`since == max(seq)` 且 items 为空 → 当作全量。
      //    这是 Day 16 评审挑出的漏洞：云端被整体重建（重跑 seed / 墓碑清空）后
      //    seq 会从头开始，「seq > since」为空，而 `since > max` 又不成立，
      //    客户端会以为「云端没变化」，两端永久不一致且不报错。
      //    ⚠️ 必须是「等于」AND「空」两个条件同时成立 ——
      //    items 非空时不能触发，否则每次都会白拉一遍全量。
      if (rows.length === 0 && since === maxSeq) {
        rows = await fetchAll()
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

/**
 * 拿到数据库客户端 `app.rdb()` —— 这是 Day 17 定下来的最终方案。
 *
 * 🔴 为什么不走 `pg` 直连：免费版**不给**内网地址，公网直连也开不了
 *    （社区官方答复：个人版两条 TCP 路都不通），且要手配 5 个环境变量。
 *    `app.rdb()` 走 HTTP（`/v1/rdb/rest`，PostgREST 风格），凭证用云函数
 *    的运行角色（`getClientCredential()`）→ **一个环境变量都不用配**。
 *
 * 🔴 `{ database: 'public' }` 这行**不能省**，而且参数名在骗人：
 *    它最终被塞进 PostgREST 的 `Accept-Profile` 头，语义是 **schema 名**，
 *    不是 PostgreSQL 的库名。不传时 SDK 会拿 envId 当 schema
 *    → 报 `406 DATABASE_PGRST106 Invalid schema: priorknow-xxx`。
 *    我们建表用的是默认 schema `public`，所以这里必须显式写死。
 *
 * ⚠️ 延迟创建、不在模块顶层初始化：
 *    顶层 `require` 或 `init` 一旦失败，会连 `/api/health` 一起 500 ——
 *    而 health 的设计前提就是「不连数据库」。晚一点初始化，代价只是
 *    每个实例第一次请求多几毫秒。
 *
 * ⚠️ 客户端可以缓存：envId 是从 `TCB_ENV` / `SCF_NAMESPACE` 环境变量取的，
 *    同一个实例内不会变（缓存的是「连哪个环境」，不是「连哪个用户」）。
 */
let _db = null
function getDb() {
  if (_db) return _db
  const cloudbase = require('@cloudbase/node-sdk')
  const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
  _db = app.rdb({ database: 'public' })
  return _db
}

/**
 * 执行一个链式查询并统一处理返回值。
 *
 * 🔴 这个函数存在的唯一理由：`app.rdb()` 查询失败时**不抛异常**，
 *    而是 resolve 出 `{ status, data, error }`。漏看 `error` 一次，
 *    前端就会拿到「ok:true + 空数组」—— 看起来像「云端没数据」，
 *    比直接报错难查十倍。所以所有查询都必须走这里。
 */
async function queryAll(builder) {
  const res = await builder
  if (res && res.error) {
    const e = new Error(res.error.message || '数据库查询失败')
    e.dbCode = res.error.code
    e.dbStatus = res.status
    throw e
  }
  // 空结果时 data 是 []（极端情况可能是 null），统一成数组，上层不用再判
  return Array.isArray(res && res.data) ? res.data : []
}

/** HTTP 头的键大小写不固定，统一按小写比对取值。 */
function readHeader(headers, name) {
  if (!headers) return undefined
  const target = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key]
  }
  return undefined
}

/**
 * 数据库列（snake_case）→ 接口字段（camelCase）。
 * 这个映射**必须逐个字段写出来**，不能用 `{...row}` 加批量改名 ——
 * 那样一旦表新增了列，接口会静默多返回一个契约里没有的字段。
 */
function toTaskDto(row) {
  return {
    id: row.id,
    // 🔴 bigint 列在 node-postgres 里是**字符串**（防止超过 JS 安全整数）。
    //    不转的话前端 `r.seq > l.seq` 会变成字符串比较："9" > "10" 为 true，
    //    整个增量同步的「谁更新」判断全错，而且不报错。
    seq: Number(row.seq),
    title: row.title,
    dueAt: toIso(row.due_at),
    estimateMinutes: row.estimate_minutes === null ? null : Number(row.estimate_minutes),
    importance: Number(row.importance),
    status: row.status,
    createdAt: toIso(row.created_at),
    deletedAt: toIso(row.deleted_at),
    purgedAt: toIso(row.purged_at),
  }
}

/** timestamptz → ISO 8601 字符串；null 保持 null（不能变成 0 或空串）。 */
function toIso(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ════════════════════════════════════════════════════════════
//  POST /api/tasks —— Day 18 新增
//  契约：docs/规格/api-contract.md 第三节第 2 个接口
// ════════════════════════════════════════════════════════════

/** 契约：一次最多 1000 条（在撞云函数请求体上限之前先给一句人话） */
const MAX_BATCH = 1000
/** 契约：title 去空格后 1–200 字（与 db/schema.sql 的 CHECK 同一条规则） */
const TITLE_MAX = 200
/** 与 db/schema.sql 的 tasks_id_format_chk 同一条正则 —— 两处不一致会变成 500 而不是 400 */
const ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/
/** 与 db/schema.sql 的 status CHECK 同一组取值 */
const STATUS_SET = new Set(['todo', 'doing', 'done'])
/** 分批查库时每批的条数：PostgREST 的 `in.(…)` 是拼在 URL 上的，塞太多会超长 */
const IN_BATCH = 100

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
  let db
  try {
    db = getDb()
  } catch (err) {
    console.error('[POST /api/tasks] app.rdb() 初始化失败：', err && err.message)
    return reply(500, { ok: false, data: null, error: '服务器连不上数据库，请稍后再试' })
  }

  try {
    const existing = new Map() // id → 库里那一行
    const ids = [...new Set(candidates.map((c) => c.id))]
    for (const batch of chunk(ids, IN_BATCH)) {
      const rows = await queryAll(
        db
          .from('tasks')
          .select(
            'id,title,status,due_at,estimate_minutes,importance,created_at,deleted_at,purged_at'
          )
          .eq('user_id', userId)
          .in('id', batch)
      )
      for (const r of rows) existing.set(r.id, r)
    }

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
    const inserts = []
    for (const c of toInsert) {
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
    const dupSet = new Set()
    const newTitles = [...new Set(inserts.map((c) => c.provided.title).filter(Boolean))]
    if (newTitles.length > 0) {
      for (const batch of chunk(newTitles, 50)) {
        const dups = await queryAll(
          db
            .from('tasks')
            .select('id,title')
            .eq('user_id', userId)
            .neq('status', 'done')
            .is('deleted_at', null)
            .is('purged_at', null)
            .in('title', batch)
        )
        for (const d of dups) dupSet.add(String(d.title).trim())
      }
    }

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

    const written = await queryAll(
      db.from('tasks').upsert(rows, { onConflict: 'id', defaultToNull: false }).select(COLUMNS)
    )

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

/**
 * 判定单条 —— 只做内存里的判断，不碰数据库。
 * 返回 { reject: {index, field, reason} } 或 { item: {...} }。
 *
 * 名字里的「判」不含判重：判重要查库，在第二遍做。
 */
function judgeOne(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { reject: { index, field: null, reason: '不是有效的任务对象' } }
  }
  // 新增必须带 id（理由见契约：「云端生成 id」会造成本地孤儿 + 云端孤儿）
  if (!('id' in raw) || typeof raw.id !== 'string' || raw.id === '') {
    return { reject: { index, field: 'id', reason: '新增任务必须带 id' } }
  }
  if (!ID_FORMAT.test(raw.id)) {
    return { reject: { index, field: 'id', reason: '任务编号格式不对' } }
  }

  const item = { index, id: raw.id, purge: raw.purge === true, provided: {}, corrected: false }
  const markCorrected = () => {
    item.corrected = true
  }

  // ── title：出现就跑校验（新增和修改都跑）──────────────────
  // 🔴 契约里的坑：第一版只写了「新增时」，修改路径直接漏了，
  //    { id, title: '   ' } 会把空串写进库（text not null 拦不住空串）。
  if ('title' in raw) {
    if (typeof raw.title !== 'string') {
      return { reject: { index, field: 'title', reason: '任务标题不能为空' } }
    }
    const t = raw.title.trim()
    if (t === '') {
      return { reject: { index, field: 'title', reason: '任务标题不能为空' } }
    }
    if (t.length > TITLE_MAX) {
      return {
        reject: { index, field: 'title', reason: `任务标题太长了（最多 ${TITLE_MAX} 字）` },
      }
    }
    // 首尾空格统一去掉再入库 —— 判重用「精确匹配 title」才等价于「去空格后相同」
    if (t !== raw.title) markCorrected()
    item.provided.title = t
  }

  // ── dueAt：解析不出就**拒**（兜底成 null 会让任务静默排到最后）──
  if ('dueAt' in raw) {
    const v = raw.dueAt
    if (v === null || v === undefined) {
      item.provided.due_at = null
    } else if (typeof v !== 'string') {
      item.provided.due_at = null
      markCorrected()
    } else {
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) {
        return { reject: { index, field: 'dueAt', reason: '截止时间格式不对' } }
      }
      item.provided.due_at = d.toISOString()
    }
  }

  // ── estimateMinutes：类型不对/0/负数 → null；小数 → 四舍五入 ──
  if ('estimateMinutes' in raw) {
    const v = raw.estimateMinutes
    if (v === null || v === undefined) {
      item.provided.estimate_minutes = null
    } else if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      item.provided.estimate_minutes = null
      markCorrected()
    } else {
      const rounded = Math.round(v)
      if (rounded !== v) markCorrected()
      item.provided.estimate_minutes = rounded
    }
  }

  // ── importance：越界/非数字 → 夹到 1–5 ────────────────────
  if ('importance' in raw) {
    const v = raw.importance
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      item.provided.importance = 3
      markCorrected()
    } else {
      const clamped = Math.min(5, Math.max(1, Math.round(v)))
      if (clamped !== v) markCorrected()
      item.provided.importance = clamped
    }
  }

  // ── status：非法值 → 'todo' ──────────────────────────────
  if ('status' in raw) {
    if (STATUS_SET.has(raw.status)) {
      item.provided.status = raw.status
    } else {
      item.provided.status = 'todo'
      markCorrected()
    }
  }

  // ── createdAt：受保护字段 ─────────────────────────────────
  // 修改时一律忽略、用库里的真值（在 buildRow 里体现）；新增时采纳，
  // 解析不出就用服务器时间（只是展示顺序的依据，猜错没后果 —— 与 dueAt 相反）。
  if ('createdAt' in raw) {
    const d = new Date(raw.createdAt)
    if (typeof raw.createdAt === 'string' && !Number.isNaN(d.getTime())) {
      item.createdAtProvided = d.toISOString()
    } else {
      markCorrected()
    }
  }

  // ── deletedAt：非空且解析不出 → 拒 ────────────────────────
  if ('deletedAt' in raw) {
    const v = raw.deletedAt
    if (v === null || v === undefined) {
      item.provided.deleted_at = null
    } else if (typeof v !== 'string') {
      return { reject: { index, field: 'deletedAt', reason: '删除时间格式不对' } }
    } else {
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) {
        return { reject: { index, field: 'deletedAt', reason: '删除时间格式不对' } }
      }
      item.provided.deleted_at = d.toISOString()
    }
  }

  // ── seq / userId：受保护，一律忽略（连记都不记，避免被人误用）──
  return { item }
}

/**
 * 把「判定通过的一条」拼成要写库的整行。
 *
 * 🔴 为什么修改时也用整行写：upsert 是一条语句，INSERT 分支需要所有 NOT NULL 列
 *    （title / created_at 没有默认值）。用库里的现值补齐，UPDATE 分支就是「写回原值」，
 *    语义等价于契约的「只更新出现过的字段」，但少了一半代码。
 * 🔴 `seq` 永远不在这里出现 —— 它只能由数据库序列给。
 */
function buildRow(c, cur, userId) {
  const now = new Date().toISOString()
  const pick = (key, curKey, fallback) =>
    key in c.provided ? c.provided[key] : cur ? cur[curKey] : fallback

  const row = {
    id: c.id,
    user_id: userId,
    title: pick('title', 'title', null),
    due_at: pick('due_at', 'due_at', null),
    estimate_minutes: pick('estimate_minutes', 'estimate_minutes', null),
    importance: pick('importance', 'importance', 3),
    status: pick('status', 'status', 'todo'),
    created_at: cur ? cur.created_at : c.createdAtProvided || now,
    deleted_at: pick('deleted_at', 'deleted_at', null),
    purged_at: cur ? cur.purged_at : null,
  }
  if (c.purge) row.purged_at = now // 彻底删除 = 打墓碑，行保留
  return row
}

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
exports.__test__ = {
  SQL_LIST_FULL,
  SQL_LIST_SINCE,
  SQL_MAX_SEQ,
  PAGE_SIZE,
  COLUMNS,
  MAX_BATCH,
  TITLE_MAX,
  ID_FORMAT,
  judgeOne,
  buildRow,
  chunk,
  toTaskDto,
  toIso,
  readHeader,
}
