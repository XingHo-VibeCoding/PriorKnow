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

  // ── 非 GET：明确 405，不悄悄返回 200 ────────────────────
  // 悄悄返回 200 会让 Day 17 接真接口时的调试变难。
  if (method !== 'GET') {
    return reply(405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET' })
  }

  if (isHealth) {
    return reply(200, {
      ok: true,
      // 项目英文名。课程模板要求填项目英文名，我用仓库名 priorknow。
      service: 'priorknow',
      // ⚠️ 课程模板里没有这一项，是我加的。
      //    作用：验证时刷新一次看time 变没变 —— 变了才说明是函数实时算出来的，
      //    不是缓存页或静态文件。觉得多余可以删掉，不影响其他部分。
      time: new Date().toISOString(),
    })
  }

  // 今天故意只实现一个路由。真实接口（/api/tasks 等）在 Day 17 起
  // 按 api-contract.md 逐条加 —— 契约里登记过的才写，契约外的不写。
  return reply(404, { ok: false, error: 'not_found', path })
}

/**
 * 统一出口：返回官方定义的 IntegrationResponse。
 *
 * body 传对象框架也能序列化，但显式 JSON.stringify 更可控 ——
 * 能保证 Content-Type 与实际内容一致，不依赖框架的猜测。
 */
function reply(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  }
}
