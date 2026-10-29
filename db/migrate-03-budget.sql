-- =============================================================================
-- 知先 PriorKnow · 迁移 03：按日期存「今日剩余时间」
--
-- 背景：预算原来只存 localStorage（`priorknow.budget-minutes`），换设备就没了。
--       用户要求写进云存储，并且空着的时候要提示他填。
--
-- 🔴 为什么是「一天一条」而不是「一个用户一个默认值」：
--    「今日剩余时间」字面上就是逐日变化的 —— 今天只剩 3 小时、明天有 8 小时。
--    若只存一个默认值，用户每天都得改同一个数字，而且「今天填了没有」无从判断，
--    空状态提示也就永远只出现一次。
--    按日期存之后：隔天自然变空 → 那天重新填；同一天换设备能看到同一个值。
--    （取舍已与用户当面确认，见 docs/日志/day24b-time-wheel-and-budget.md）
--
-- ⚠️ 本文件是**幂等**的：`CREATE TABLE IF NOT EXISTS` + `GRANT`（授权重复执行无副作用）。
--    与 db/schema.sql 的区别：schema.sql 开头是 DROP TABLE tasks（建表期故意破坏性重建），
--    而这张表从第一天起就可能有真实数据，**不能**跟着那个文件一起重建。
--    → 所以它单独在这里，schema.sql 只留一句指路。
--
-- 执行方式：
--   ① 控制台 → 数据库 → SQL 编辑器，整份粘贴；
--   ② 命令行：tcb db execute -e priorknow-d0go4uh2uc0f62465 --sql "<下面正文>"
-- =============================================================================


CREATE TABLE IF NOT EXISTS daily_budget (

    -- 分区键。规则与 tasks.user_id 完全一致（同一套正则、同一个 CHECK），
    -- 这样以后换成登录态 uid 时，这里一个字都不用改。
    user_id    text        NOT NULL,

    -- 🔴 日期用 `date` 类型，不用 timestamptz：
    --    「今天」是一个**本地日历日**，不是某个时刻。存成时间戳就必须再回答
    --    「按谁的时区算这一天」—— 而客户端和服务端的时区不一定相同，
    --    跨零点那条会算到别的日子上去。存 date，客户端传 '2026-10-30' 就完事。
    on_date    date        NOT NULL,

    -- 分钟数。0 不合法：0 分钟预算等于「今天什么都做不了」，
    -- 而那件事的正确表达是「不填」（= 这一行不存在）。
    -- 上限 1440（一天）：这是「今日剩余时间」，超过一天的输入一定是打错了。
    -- ⚠️ 注意与 estimate_minutes 的区别：那条**不设上限**（一件事可以横跨好几天），
    --    这条有上限。两张表规则不同是有意的。
    minutes    integer     NOT NULL,

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT daily_budget_pkey PRIMARY KEY (user_id, on_date),

    CONSTRAINT daily_budget_user_id_format_chk
        CHECK (user_id ~ '^[A-Za-z0-9_-]{1,64}$'),

    CONSTRAINT daily_budget_minutes_chk
        CHECK (minutes > 0 AND minutes <= 1440)
    -- ⚠️ 表级约束列表末不能带逗号（PostgreSQL 会报 syntax error at or near ")"）
);


-- -----------------------------------------------------------------------------
-- 授权
--
-- 🔴 与 migrate-02 同一个理由：云函数的运行角色落到 PG 的 **`anon`** 角色，
--    默认只有 SELECT。不给 GRANT，第一次 POST 就是 500 `permission denied`。
--    这张表没有 IDENTITY / SEQUENCE 列，所以不需要序列授权那一句。
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_budget TO anon;


-- -----------------------------------------------------------------------------
-- 自查
-- -----------------------------------------------------------------------------
-- ① 表在不在、约束对不对：
--SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_name = 'daily_budget' ORDER BY ordinal_position;
--
-- ② 权限够不够（预期 anon 那行是 DELETE,INSERT,SELECT,UPDATE）：
--SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--  FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'daily_budget'
--  GROUP BY grantee ORDER BY grantee;
--
-- ③ 上限真的拦得住（这条必须报错）：
--INSERT INTO daily_budget (user_id, on_date, minutes) VALUES ('u-test', '2026-10-30', 5000);
--
-- ④ 同一天重复写只能有一条（这条必须报 23505）：
--INSERT INTO daily_budget (user_id, on_date, minutes) VALUES ('u-test', '2026-10-30', 60);
--INSERT INTO daily_budget (user_id, on_date, minutes) VALUES ('u-test', '2026-10-30', 90);
-- -----------------------------------------------------------------------------
