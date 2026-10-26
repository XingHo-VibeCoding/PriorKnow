-- =============================================================================
-- 知先 PriorKnow · 迁移 01：让 UPDATE 自动推进 seq
--
-- 依据：docs/规格/api-contract.md 第三节「修改必须推进 `seq`」
--
-- 🔴 为什么需要它（不懂这段就别改这个文件）：
--    `seq` 是增量同步的命脉 —— 客户端靠 `GET ?since=<游标>` 拉「比游标新的」。
--    而一条任务被**改**了（改标题、标完成、移回收站）如果不产生新的 seq，
--    它的 seq 仍然小于游标 → **另一台设备永远拉不到这次修改，而且不报错**。
--
-- 🔴 为什么不用 `SET seq = DEFAULT`（最直觉的写法）：
--    那需要云函数自己拼 SQL，但云函数走的是 `app.rdb()`（HTTP + PostgREST），
--    PostgREST 只能「按列名给值」，表达不出 `= DEFAULT`；
--    而 `seq` 是 `GENERATED ALWAYS AS IDENTITY`，只接受 `SET seq = DEFAULT`
--    （写 `SET seq = 123` 直接被拒：column "seq" can only be updated to DEFAULT）。
--    → 把这条规则下沉到数据库，云函数就一行特殊代码都不用写，
--      以后 Day 22 的 PATCH / DELETE 也自动受益。
--
-- ✅ 已验证（pglite 真 PostgreSQL 引擎）：
--    · 普通 `UPDATE tasks SET title=…`            → seq 推进
--    · `INSERT … ON CONFLICT (id) DO UPDATE`（PostgREST 的 upsert 走这条）→ seq 推进
--    · `GENERATED ALWAYS` 不会拦住触发器对 NEW.seq 的赋值
--
-- ⚠️ 本文件是**幂等**的（CREATE OR REPLACE + DROP TRIGGER IF EXISTS），
--    重复执行没有副作用。它**不碰表结构和数据**，只加一个规则。
--
-- 执行方式：CloudBase 控制台 → 数据库 → SQL 编辑器，整份粘贴执行。
-- 执行完立刻用下面第 3 步验证（见文件末尾）。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 触发器函数：任何 UPDATE 都给这一行换一个新号
--
-- `pg_get_serial_sequence` 对 identity 列同样有效，不用知道序列叫什么名字
-- （实际叫 tasks_seq_seq 之类，硬编码名字容易在换环境时炸）。
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tasks_bump_seq() RETURNS trigger AS $$
BEGIN
    NEW.seq := nextval(pg_get_serial_sequence('tasks', 'seq'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 2. 挂到 tasks 表上（BEFORE UPDATE = 写入磁盘之前改）
--
-- ⚠️ 加 `DROP TRIGGER IF EXISTS` 是为了重复执行不报错。
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tasks_bump_seq_trg ON tasks;

CREATE TRIGGER tasks_bump_seq_trg
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION tasks_bump_seq();


-- -----------------------------------------------------------------------------
-- 3. 验证（执行完上面两段后，手动跑这三句看一眼）
--
--    ① 先记下当前号：
--         SELECT id, seq, title FROM tasks WHERE id = 'sample-07';
--
--    ② 改一下标题（随便改，改完可以改回去）：
--         UPDATE tasks SET title = '触发器验证' WHERE id = 'sample-07';
--
--    ③ 再查一次：**title 变了，seq 也应该变成更大的新号**。
--        如果 seq 没变 → 触发器没挂上，回头检查 function 和 trigger 是否都建成功。
--
--    ⚠️ 验证完记得把标题改回去（或者留着，不影响功能）。
-- -----------------------------------------------------------------------------
