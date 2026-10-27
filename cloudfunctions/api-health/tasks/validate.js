/**
 * 业务层：入库前的校验规则（Day 19 从 index.js 拆出）。
 *
 * `judgeOne` 是**纯函数** —— 一行数据库都不碰，只做内存里的判断。
 * 这一点很关键：它可以在本机被反复测试，不需要连库。
 */
/** 契约：一次最多 1000 条（在撞云函数请求体上限之前先给一句人话） */
const MAX_BATCH = 1000
/** 契约：title 去空格后 1–200 字（与 db/schema.sql 的 CHECK 同一条规则） */
const TITLE_MAX = 200
/** 与 db/schema.sql 的 tasks_id_format_chk 同一条正则 —— 两处不一致会变成 500 而不是 400 */
const ID_FORMAT = /^[A-Za-z0-9_-]{1,64}$/
/** 与 db/schema.sql 的 status CHECK 同一组取值 */
const STATUS_SET = new Set(['todo', 'doing', 'done'])
/** 分批查库时每批的条数：PostgREST 的 `in.(…)` 是拼在 URL 上的，塞太多会超长 */

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

module.exports = {
  MAX_BATCH,
  TITLE_MAX,
  ID_FORMAT,
  STATUS_SET,
  judgeOne,
}
