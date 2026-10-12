-- =============================================================================
-- 知先 PriorKnow · 数据库表结构
--
-- 依据：docs/规格/api-contract.md 第五节（字段全部从契约推导，没有一个字段是
--       自己另造的）。第3 周实现云函数时，本文件是唯一依据。
--
-- 执行环境：CloudBase PostgreSQL（控制台 → 云开发 → 数据库 → SQL 编辑器）
--
-- ⚠️⚠️⚠️ 重新执行本脚本会**清空tasks 表的全部数据** ⚠️⚠️⚠️
-- 本文件开头是 `DROP TABLE IF EXISTS tasks`。这是有意为之：
--建表阶段（Day 16）需要反复调整表结构，「幂等地 CREATE TABLE IF NOT EXISTS」
-- 反而危险—— 表已存在但结构是旧版时，它会**静默跳过**，你看到「执行成功」
-- 却以为结构已更新。所以宁可破坏性重建，也不要静默不一致。
--
--   Day 16 迭代期：放心反复执行（库里还没有真实数据）
--   Day 17 起有真实数据后：**不要**再执行本文件，改用 ALTER TABLE 增量迁移
--
-- 只想灌示例数据而不动表结构 → 用 db/seed.sql（它只 TRUNCATE 数据，不改表）
-- =============================================================================

DROP TABLE IF EXISTS tasks;


-- -----------------------------------------------------------------------------
-- 一张表，11 个列
--
-- 为什么只有一张：知先只有一个数据对象 Task（app/src/core/types.ts）。
-- 课程案例的热搜项目有两张表（trends / favorites），是因为它有两个独立概念，
-- 那是业务本身要求的 —— 课程第 1358 行也明说「不要照抄到你的项目里」。
--
-- 13 个页面动作里有 5 个不需要后端（预算条、筛选、导出、四态展示、原因计算），
-- 因为派生值不入库、算分排序全在前端做（取舍 1）。
-- -----------------------------------------------------------------------------
CREATE TABLE tasks (

    -- ---- 组1：身份与分区 ------------------------------------------------------

    -- 主键。🔴 用 text 不用 uuid —— 本地 newId()（local-indexeddb.ts:139-144）
    -- 在非安全上下文会退回 `t-${时间戳36进制}-${随机串}` 形状，不是 UUID。
    -- 历史上已存进本地库的那些 id 就是这个形状，写成 uuid 会把它们全拒掉。
    id           text        NOT NULL,

    -- 分区键（不是外键）。🔴 当前没有 users 表，外键指向不存在的父表会建表失败；
    -- 且 user_id 是浏览器随机串，父表里根本没有对应行。
    -- ⚠️ 它不是身份凭证 —— 可伪造、清缓存即换区。见契约第七节不一致 2。
    -- Day 22 之后若接CloudBase 内置认证，uid 形如 user_8f2a 天然符合下面这条
    -- CHECK，届时才谈得上加外键（父表是平台的 auth.users）。
    user_id      text        NOT NULL,

    -- ---- 组 2：变更顺序 —— 整个同步机制的命脉 -------------------------------

    -- 🔴 必须是 ALWAYS，不能是 BY DEFAULT：
    --    by default → 客户端传了 seq 会被「静默接受」→ 序号可被回退 → 同步自我摧毁
    --    always     → 直接报错（除非写 OVERRIDING SYSTEM VALUE），数据库层堵死
    -- 正常写代码时很容易出现 `{ ...task, status: 'done' }` 这种展开写法，
    -- 请求体里天然带上了旧的 seq —— 所以这道保险是必需的，不是多余的。
    --
    -- ⚠️ 绝对不要改成 `SELECT max(seq) + 1` 自己算：两个请求同时来会拿到同一个值，
    --    「比 seq 大的才算新」这个判断失效，同步会**静默漏掉一条，不报错**。
    --
    -- ⚠️ seq 只增不减：记录被移入回收站、被彻底删除时序号也不回收。
    --
    -- 🔴 「只增不减」只保证游标**不会因为中间少号而失效**，
    --    它【不等于】「游标永远有效」。有一种情况会让游标真的失效：
    --    本区 max(seq) 变小 —— 两条原因都会造成：
    --      ① 墓碑 90 天惰性清理（本区行被 DELETE 掉，见契约第五节）
    --      ② db/seed.sql 的 TRUNCATE ... RESTART IDENTITY（seq 归零）
    --
    --    这时客户端带着旧 since 来，而 seq > since 仍可能为假
    --    （例：since=7 而新 max(seq)=7 → 7 > 7 为假 → 返回空+ notice=null），
    --    云端认不出「这个游标已经不属于这个区了」——
    --    因为 seq 是全局序列，**没有「有效游标」这个状态**。
    --
    -- ⚠️ 所以别把「seq 只增不减」当成游标的自愈机制。
    --    真正的恢复路径只有一条：契约第六节的
    --    「since > 本区 max(seq) → 当作全量 + notice」，
    --    而它恰好在 since == max(seq) 时【不】触发。
    seq          bigint      GENERATED ALWAYS AS IDENTITY,

    -- ---- 组 3：任务内容 —— 算法只读这四个 ------------------------------------

    -- 🔴 去首尾空格后必须 1–200 字。这是**唯一不可兜底修正的字段**：
    --    空串或超长没有合理的修正语义（夹紧？改成 null？都不对），只能拒。
    --    只在 NOT NULL 上加 CHECK 拦不住空串 —— '   ' 是非空的，必须靠这条。
    --    ⚠️ 而上面那条 btrim CHECK 挡不住 tab / 换行 / 全角空格 → 所以有两条 title 约束。
    title            text NOT NULL,

    -- 🔴 「没有期限」必须存 NULL，不能存 0 或空串：
    --    那样紧迫度会算成「已逾期」，直接排到队列最前面（见 core/priority.ts）。
    due_at           timestamptz,

    -- 🔴 「未估算」必须存 NULL，不能存 0：
    --    0 分钟会被算法当成「瞬间完成」，省时度顶格、等于凭空加分。
    --    契约已定：只要 > 0 的整数，不设上限（1440 那个限制已被否掉）。
    estimate_minutes integer,

    -- 重要度 1–5。数据库层加 CHECK 是第二道保险 —— 云函数会做兜底修正
    --（99 → 5），但「万一代码写错了」时这道约束会直接报错而不是静默存进脏数据。
    importance       smallint  NOT NULL DEFAULT 3,

    ---- 组 4：状态与时间 ------------------------------------------------------

    status           text        NOT NULL DEFAULT 'todo',

    -- 🔴 由**前端**生成，不是云端（与契约第一版相反，理由见第五节）：
    --    增量同步下前端要能「离线新建并立刻看到它」，不等网络往返。
    --    时钟不准只影响「全部任务」页的展示顺序 —— 它不参与算分、
    --    不参与增量判断（那是 seq 的事），所以不会有同步风险。
    created_at       timestamptz NOT NULL,

    -- ---- 组 5：删除生命周期（回收站 + 墓碑）----------------------------------

    -- 回收站：填了时间戳 = 已删除、**可恢复**；NULL = 正常。
    deleted_at       timestamptz,

    -- 🔴 墓碑：填了时间戳 = 已在回收站被彻底删除。
    --    **行还在库里**，这是设计中最反直觉的一点，理由见下方长注释。
    purged_at        timestamptz,

    -- ---- 约束 ---------------------------------------------------------------

    CONSTRAINT tasks_pkey PRIMARY KEY (id),

    -- id 格式：1–64，只含 [A-Za-z0-9_-]
    -- （这条同时覆盖 UUID 的连字符与本地 t- 开头的历史 id 两种形状）
    CONSTRAINT tasks_id_format_chk
        CHECK (id ~ '^[A-Za-z0-9_-]{1,64}$'),

    -- user_id 用同一套格式规则，好处是 Day 22 换成 auth.users 的 uid 时
    -- 这条约束一个字都不用改。
    CONSTRAINT tasks_user_id_format_chk
        CHECK (user_id ~ '^[A-Za-z0-9_-]{1,64}$'),

    -- title 去首尾空格后 1–200 字（不是用 length()，那样 '   ' 能通过）
    CONSTRAINT tasks_title_len_chk
        CHECK (char_length(btrim(title, E' \t\n\r\f\v')) BETWEEN 1 AND 200),

    -- 🔴 为什么这条不能靠上面那条挡：PostgreSQL 的 btrim(text) **只去半角空格**，
    --    而前端的 .trim() 按 WhiteSpace 规范会去掉 tab / 换行 / **全角空格 U+3000**。
    --    「全角空格」是中文输入下 Shift+空格 的常见产物 —— 用户看着像空的，
    --    但 btrim 不认它，于是入库成一张看起来全空的卡片
    --    （前端 .trim() 之后才是 ''，而那时候已经在库里了）。
    --
    --    ⚠️ 注意：POSIX 正则的 \s / [[:space:]] **同样不含 U+3000**，
    --    所以只能像这样显式列举第2 个字符（那个全角空格）。
    CONSTRAINT tasks_title_not_blank_chk
        CHECK (btrim(title, E' \t\n\r\f\v　') <> ''),

    CONSTRAINT tasks_estimate_positive_chk
        CHECK (estimate_minutes IS NULL OR estimate_minutes > 0),

    CONSTRAINT tasks_importance_range_chk
        CHECK (importance BETWEEN 1 AND 5),

    CONSTRAINT tasks_status_chk
        CHECK (status IN ('todo', 'doing', 'done'))

    -- ⚠️ deleted_at 与 purged_at 是两个独立字段，不加「purged 必须先 deleted」的
    --    约束 —— 契约允许对一条从没进过回收站的记录直接发 purge。
    --
    -- ⚠️⚠️ 上面最后一条约束后面**不能有逗号** —— PostgreSQL 的表级约束列表
    --    不接受尾逗号（`..., CONSTRAINT x CHECK (...),)` 会报
    --    `syntax error at or near ")"`）。这个错误是靠在本机跑真引擎
    --    （@electric-sql/pglite）抓到的，不是靠看出来的。
);

-- -----------------------------------------------------------------------------
-- 索引：只为「契约里真实存在的查询」而建，不为「将来也许会用」而建。
-- 每一条索引都是写入时的成本，而契约里没有查询用它就别建。
-- -----------------------------------------------------------------------------

-- 🔴 这一条是增量同步的性能命脉。
--    第 1 个接口的核心 SQL 是：
--        SELECT * FROM tasks
--         WHERE user_id = $1 AND seq > $2
--         ORDER BY seq LIMIT $3;
--    没有这条索引，每次拉取都要全表扫再过滤。
--    复合索引 (user_id, seq) 同时服务「分区过滤」与「按 seq 排序」两件事。
CREATE INDEX tasks_user_id_seq_idx ON tasks (user_id, seq);

-- ⚠️ 主键上已自动有索引（PRIMARY KEY (id) 会建一个 btree），所以不再重复建 id 索引。


-- =============================================================================
-- ❌ 刻意不建的字段（写在这里是为了防止以后「顺手补上」，那会破坏设计）
-- =============================================================================
--
-- priority / score
--     派生值不入库（取舍 1）。权重一调，存下来的分数全过期。
--     算分在 app/src/core/priority.ts，每次读取时现算。
--
-- updated_at
--     用 seq 就够了。如果改用「比某个时间戳新的」做增量，
--     用户把电脑时间调回去年，云端会以为那些记录全都没变 —— **同步静默失效**。
--     序号不受任何时钟影响，这是选 seq 的唯一理由。
--
-- dependency_ids
--     PRD 第四节已把「复杂依赖关系」列为本期不做。
--     造一个永远为空的字段，等于给实现者一个「这里该用但还没用」的假线索。
-- =============================================================================


-- =============================================================================
-- 自查：建完表跑这三条，不符就别往下走
-- =============================================================================
--SELECT column_name, data_type, is_nullable, column_default
--  FROM information_schema.columns
--  WHERE table_name = 'tasks' ORDER BY ordinal_position;
--
--SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tasks';
--
-- 🔴⚠️ 验seq 不可被覆盖（两条都必须报错才对）：
--   这不是理论 —— 本机用真引擎（pglite）实测过三种写法的差异：
--     GENERATED ALWAYS AS IDENTITY   → 报错「cannot insert a non-DEFAULT value」
--     GENERATED BY DEFAULT AS IDENTITY → 🔴 静默接受 999，序号可被回退
--     DEFAULT nextval('...')            → 🔴 同样静默接受
--
--INSERT INTO tasks (id,user_id,title,created_at)
--VALUES ('t-test','u-test','x',now());                        -- 成功，seq 自动得 1
--INSERT INTO tasks (id,user_id,seq,title,created_at)
--VALUES ('t-test2','u-test',999,'x',now());                    -- 必须报错
--
-- ⚠️ 查 identity 要看 pg_attribute.attidentity（'a'=ALWAYS），
--    **不要**查 information_schema.column_default —— identity 列不写
--    default 表达式，那里查出来是 NULL，会误判成「没设自增」。