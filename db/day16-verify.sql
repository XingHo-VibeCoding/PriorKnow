-- =============================================================================
-- Day 16 最终验收：一条一条自查（整份复制到控制台执行）
--
-- 每条期望结果都写在注释里。全绿 = 今天可以提交。
-- ⚠️ 本脚本只SELECT，不改数据 —— 跑它不会动你的 7 条示例。
-- =============================================================================


-- ---------- ① 表结构：应该 11 列，类型与契约第五节一致 ----------
-- 期望：11 行；seq 是 identity 且 NOT NULL；due_at/estimate_minutes/deleted_at/purged_at 可空
SELECT column_name, data_type, is_nullable, is_identity, identity_generation, column_default
  FROM information_schema.columns
 WHERE table_name = 'tasks'
 ORDER BY ordinal_position;

-- 🔴 seq 那一行必须显示 is_identity=YES、identity_generation=ALWAYS。
--    ⚠️ column_default 会显示空 —— identity 列不写 default 表达式，这是正常的，
--       别据此以为没设自增（要看 is_identity / identity_generation）。


-- ---------- ② 新增的那条约束在不在（今天新修的）----------
-- 期望：tasks_title_not_blank_chk 这一行要出现
SELECT conname, pg_get_constraintdef(oid) AS 定义
  FROM pg_constraint
 WHERE conrelid = 'tasks'::regclass AND contype = 'c'
 ORDER BY conname;
-- 期望：7 行（id格式 / user_id格式 / title长度 / title非空白 / estimate正数 / importance范围 / status枚举）


-- ---------- ③ 索引 ----------
-- 期望：2 行 —— tasks_pkey 与 tasks_user_id_seq_idx（增量同步的命脉）
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tasks' ORDER BY indexname;


-- ---------- ④ 数据：7 条，seq 1–7 ----------
-- 期望：7 行；seq 从 1 到 7；user_id 全是 demo-user-001；
--       deleted_at 与 purged_at 全是 NULL；created_at 相差 1 分钟（16:5x ~ 17:0x）
SELECT id, user_id, seq, title, due_at, estimate_minutes, importance, status, created_at
  FROM tasks ORDER BY seq;

SELECT count(*) AS 总行数, min(seq) AS 最小seq, max(seq) AS 最大seq,
       count(DISTINCT user_id) AS 分区数
  FROM tasks;
-- 期望：总行数 7 | 最小seq 1 | 最大seq 7 | 分区数 1


-- ---------- ⑤ 🔴 今天新修的：全角空格能不能漏进库 ----------
-- 期望：**报错**（violates check constraint "tasks_title_not_blank_chk"）
--   报错才是对的 —— 这条约束就是为了堵这个洞。
--   如果成功插进去了，说明建表用的是旧版 schema.sql，要重跑。
INSERT INTO tasks (id, user_id, title, created_at)
VALUES ('t-blank-test', 'demo-user-001', '　', now());
-- ⚠️ 这一条**报错是预期结果**，报错后请手动清掉（若真插进去了）：
--    DELETE FROM tasks WHERE id = 't-blank-test';


-- ---------- ⑥ seq 不能被覆盖（identity 的核心价值）----------
-- 期望：**报错**（cannot insert a non-DEFAULT value into column "seq"）
INSERT INTO tasks (id, user_id, seq, title, created_at)
VALUES ('t-seq-test', 'demo-user-001', 999, '测试', now());
-- ⚠️ 同样，报错才对。若真插进去了要手动删：
--    DELETE FROM tasks WHERE id = 't-seq-test';


-- ---------- ⑦ 增量扫描（契约第一个接口的核心 SQL）----------
-- 期望：3 行，seq 是 5/6/7
SELECT id, seq FROM tasks
 WHERE user_id = 'demo-user-001' AND seq > 4
 ORDER BY seq LIMIT 3;

-- 期望：**0 行**（别人的分区查不到你的数据）
SELECT count(*) AS 别人能看到的行数 FROM tasks WHERE user_id = '别人';


-- ---------- ⑧ 收尾自查 ----------
-- 期望：**7 行**（若⑤⑥报错则一直是 7；若它们意外插入了会变 9，要清掉）
SELECT count(*) AS 最终行数 FROM tasks;


-- =============================================================================
-- 全部跑完后，库应该还是那 7 条示例、seq 1–7。
-- 确认无误就可以提交 db/schema.sql 与 db/seed.sql 了。
--
-- 🔴 Day 17 起重跑这两个文件前，先看 seed.sql 第 25 行起的警告：
--    必须先清掉浏览器的游标与本地数据，否则本地与云端会永久不一致。
-- =============================================================================