/**
 * 业务层：数据库行 ↔ 接口字段 的转换（Day 19 从 index.js 拆出）。
 *
 * 三个函数都只做数据形状的翻译，不查库、也不碰 HTTP。
 */
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

module.exports = { toTaskDto, toIso, buildRow }
