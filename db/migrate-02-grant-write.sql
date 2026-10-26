-- =============================================================================
-- 知先 PriorKnow · 迁移 02：给 `anon` 角色补上「写」权限
--
-- 依据：Day 18 首次部署 POST，线上实测 500，云函数内部报
--       `permission denied for table tasks`（PG 错误码 42501 / HTTP 401）
--
-- 🔴 根因（**实测出来的，不是猜的**）：
--    Day 22 之前没有登录，云函数用 `getClientCredential()` 拿到的凭证
--    在 CloudBase PG 的 REST 入口被映射成 **`anon`** 角色，而不是 `service_role`。
--    而 Day 16 的 `db/schema.sql` 只建结构、一句 GRANT 都没写，
--    于是三个应用角色的现状是（`tcb db execute` 实测）：
--
--      anon            → SELECT                                  ← 只有读！
--      authenticated   → DELETE,INSERT,SELECT,UPDATE,...          （本来就全）
--      service_role    → DELETE,INSERT,SELECT,UPDATE,...          （本来就全）
--
--    Day 17 只做 GET（SELECT），anon 刚好够用 → 洞被盖住。
--    Day 18 第一次 INSERT → 立刻撞墙。
--
-- 🔴 为什么要单独授**序列**：
--    `seq` 是 `GENERATED ALWAYS AS IDENTITY`，背后是一个独立的 SEQUENCE 对象。
--    官方明确：**给表授了 INSERT 不会自动给序列权限**，
--    漏了这句，表权限过了还会报 `permission denied for sequence ...`。
--
-- ⚠️ 本文件是**幂等**的（重复执行只重复授权，无副作用），不碰表结构和数据。
-- ⚠️ 为什么不给 `anon` 只授 INSERT 而要给 UPDATE/DELETE：
--    契约把「改」和「删」都合并进 `POST`（upsert / 打墓碑），
--    同一条 SQL 走的是 ON CONFLICT DO UPDATE → 需要 UPDATE；
--    墓碑之后 Day 22 的 DELETE 也要用。少授一个就会在下一次改动时再撞一次。
--
-- 执行方式（两种任选）：
--   ① 控制台 → 数据库 → SQL 编辑器，整份粘贴；
--   ② 命令行：tcb db execute -e <envId> --sql "<把下面第 2 步整段贴进来>"
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 第 1 步：先看「现在到底谁有什么权限」（只读，不改任何东西）
-- -----------------------------------------------------------------------------
SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'tasks'
GROUP BY grantee
ORDER BY grantee;


-- -----------------------------------------------------------------------------
-- 第 2 步：只补 `anon` 缺的那几样
--
-- 为什么只授 anon、不顺手把三个都授一遍：
--   另外两个实测已经是全权，重复授权没有意义，只会让"到底缺什么"更难看清。
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;


-- -----------------------------------------------------------------------------
-- 第 3 步：复查（重跑第 1 步的查询）
--
--    预期：anon 那行变成 DELETE,INSERT,SELECT,UPDATE。
--
--    然后重跑那条 POST：
--      curl -X POST '<...>/api/tasks' -H 'Content-Type: application/json' \
--           -H 'X-User-Id: day18-check' -d '[{"id":"d18-001","title":"Day18 写入验证"}]'
--    预期变成 201 + accepted 一条。
--
--    ⚠️ 若仍失败，看响应里 `__debug.message`：
--      出现 `permission denied for sequence` → 序列那两句没执行成功；
--      出现 `violates check constraint` → 是我们的数据不满足 schema 约束，另查。
-- -----------------------------------------------------------------------------
