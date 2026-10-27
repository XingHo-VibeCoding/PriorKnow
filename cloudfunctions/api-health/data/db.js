/**
 * 数据访问层：连接与统一兜错（Day 19 从 index.js 拆出）。
 *
 * 这里只管「怎么拿到数据库客户端」和「查询失败了怎么统一处理」，
 * 不认识 tasks 表、也不认识任何业务字段。
 */
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

module.exports = { getDb, queryAll }
