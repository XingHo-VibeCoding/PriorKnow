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


// ════════════════════════════════════════════════════════════
//  Day 19 分层后的结构（本次重构唯一的变化，行为一行没改）
//
//    入口层   index.js            ← 你在这里：只看 method / path，然后转交
//    入口层   http/reply.js       ← 响应壳、CORS 头、读请求头
//    业务层   tasks/handlers.js   ← 两个接口的流程编排
//    业务层   tasks/validate.js   ← judgeOne（纯校验，不碰库）
//    业务层   tasks/mapper.js     ← 行 ↔ 字段 的转换
//    数据层   data/db.js          ← 拿客户端、统一兜错
//    数据层   data/tasksRepository.js ← tasks 表的全部查询
//
//  🔴 依赖只能单向：入口 → 业务 → 数据。数据层不认识上面两层。
// ════════════════════════════════════════════════════════════
const { reply, replyRaw, readHeader } = require('./http/reply')
const { INTERNAL_ERROR } = require('./messages')
const {
  handleGetTasks,
  handlePostTasks,
  handlePatchTask,
  handleDeleteTask,
} = require('./tasks/handlers')

exports.main = async (event, context) => {
  try {
    return await route(event, context)
  } catch (err) {
    // 🔴 这个 catch 存在的理由有两条，缺一条都不该留它：
    //
    //   ① **不泄漏**。没兜住时，异常会直接交给运行时，回给浏览器的是
    //      运行时自己的 500 页面 —— 里面可能有堆栈、SQL 片段、内网地址。
    //      错误信息一旦带出内部结构，攻击者就不用猜了。
    //
    //   ② **不破坏响应壳**。契约第三节说 `{ok,data,error}` 恒成立，
    //      405/404 都遵守。要是 500 换成运行时那套 HTML，前端
    //      `isEnvelope()` 判否 → 界面显示「接口返回的不是预期格式」，
    //      把「服务端炸了」说成「你地址填错了」—— 恰好指错方向。
    //
    // 所以：**日志里留全量，响应里只留一句人话**。
    console.error('[api-health] 未捕获的异常：', err && err.stack ? err.stack : err)
    return reply(500, { ok: false, data: null, error: INTERNAL_ERROR })
  }
}

async function route(event, context) {
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
      // 🔴 Day 22 加了 PATCH / DELETE —— 这里必须同步改，否则预检回的方法列表
      //    里没有它们，浏览器会在预检阶段就把请求拦掉，而后端代码根本收不到。
      //    表现是前端报 CORS 错误、云函数日志里一条记录都没有。
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

  // ── 带 id 的路径：`/tasks/:id`（Day 22 PATCH / DELETE 用）──────────
  // 🔴 只认**一段** id：`/tasks/a/b` 不匹配，落到 404。
  //    结尾斜杠上面已经统一去掉了，所以 `/tasks/abc/` 等价于 `/tasks/abc`。
  // ⚠️ id 的合法字符（[A-Za-z0-9_-]）由 handler 里的 ID_FORMAT 判，
  //    这里只负责把路径片段取出来 —— 越权校验不在路由层做。
  const itemMatch = path.match(/^\/(?:api\/)?tasks\/([^/]+)$/)
  let taskId = null
  if (itemMatch) {
    try {
      taskId = decodeURIComponent(itemMatch[1])
    } catch {
      // 非法百分号编码（如 %ZZ）：原样传下去，让 ID_FORMAT 回一句人话的 400
      taskId = itemMatch[1]
    }
  }

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

  // ── PATCH /api/tasks/:id —— 契约第六节第 3 个接口（Day 22）──────
  if (method === 'PATCH') {
    if (taskId) return await handlePatchTask(taskId, event, http.headers)
    // PATCH /api/tasks（不带 id）不支持：改哪一条必须写清楚
    return reply(404, {
      ok: false,
      data: null,
      error: '没有这个接口：改一条任务要写成 PATCH /api/tasks/{id}',
    })
  }

  // ── DELETE /api/tasks/:id —— 契约第六节第 4 个接口（Day 22）──────
  if (method === 'DELETE') {
    if (taskId) return await handleDeleteTask(taskId, http.headers)
    return reply(404, {
      ok: false,
      data: null,
      error: '没有这个接口：删一条任务要写成 DELETE /api/tasks/{id}',
    })
  }

  // ── 其余方法：明确 405，不悄悄返回 200 ────────────────────
  // 悄悄返回 200 会让调试变难。
  return reply(
    405,
    { ok: false, data: null, error: `这个接口不支持 ${method} 请求` },
    { Allow: 'GET, POST, PATCH, DELETE, OPTIONS' }
  )
}


// ⚠️ 测试导出：把各模块里的纯函数汇总到一处，方便本机回归脚本取用。
//    重构后这里改成了「重新导出」，函数本体在各自的模块里。
//    🔴 那三句 SQL 现在只是链式调用的**等价写法**，运行时不再执行 ——
//       改 data/tasksRepository.js 的链式查询时，请把那边同步改掉。
const repo = require('./data/tasksRepository')
const { judgeOne, MAX_BATCH, TITLE_MAX, ID_FORMAT } = require('./tasks/validate')
const { buildRow, toTaskDto, toIso } = require('./tasks/mapper')

exports.__test__ = {
  SQL_LIST_FULL: repo.SQL_LIST_FULL,
  SQL_LIST_SINCE: repo.SQL_LIST_SINCE,
  SQL_MAX_SEQ: repo.SQL_MAX_SEQ,
  PAGE_SIZE: repo.PAGE_SIZE,
  COLUMNS: repo.COLUMNS,
  MAX_BATCH,
  TITLE_MAX,
  ID_FORMAT,
  judgeOne,
  buildRow,
  chunk: repo.chunk,
  toTaskDto,
  toIso,
  readHeader,
}
