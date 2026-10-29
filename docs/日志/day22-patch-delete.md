# Day 22｜补齐修改和删除：PATCH / DELETE

> 课程第 1992–2095 行。**完成标准**：PATCH 修改一条数据生效；DELETE 删除后 GET 不再返回；
> 增删改查四类操作闭环。
>
> 🔴 本文件里有一节「关于「GET 不再返回」的一句实话」（第四项检查下面），
> 那不是套话，是这套接口最容易被人误判成「没做到」的地方，**先看那一节再看结论**。

---

## 一、这次的决定：补，但只做薄封装

课程要 `PATCH` / `DELETE`。上午先定的结论是「不补」（理由是这两个路由会与墓碑 + `seq` 撞车），
下午推翻 —— **上一版把两件事混成一件了**：

- 该被否定的是「**按 REST 惯例做物理删除**」
- 不是「**提供这两个路由**」

如果两个路由只是 URL 映射、内部调同一个 `applyChanges()`，就不存在两套触发器、两套墓碑规则。
真正保留下來的铁律四条（见 `docs/规格/api-contract.md` 取舍 10）：

| # | 铁律 | 违反的后果 |
| --- | --- | --- |
| 1 | 改 / 删都不新增写路径，只多一层路径语法 | 两套逻辑迟早不一致 |
| 2 | `DELETE` 必须是**软删**（写 `deletedAt`，行留着） | 行一删，`?since=` 拉不到「这条被删了」，别的设备永远不知道 |
| 3 | 任何入口都不能绕开 `seq` | 那批变更对所有设备永久不可见，且不报错 |
| 4 | `PATCH` / `DELETE` 不许做彻底删除（`purgedAt`） | 「误点删除」变成不可恢复 |

---

## 二、改了什么

| 文件 | 改动 |
| --- | --- |
| `tasks/handlers.js` | 把 POST 的「查现状 → 分新增/修改 → 判重 → upsert → 日志」抽成 `applyChanges()`；新增 `handlePatchTask` / `handleDeleteTask`；`X-User-Id` 校验收成 `readUserId()` |
| `index.js` | 加 `/tasks/:id` 与 `/api/tasks/:id` 路径匹配（正则取 id）；PATCH / DELETE 分支；OPTIONS 与 405 的 `Allow` 补上这两个方法 |
| `data/tasksRepository.js` | `findByIds` 的 `select` **补上 `seq`**（见第三项检查：这是线上抓到的真 bug） |
| `app/src/data/cloud-sync.ts` | 新增 `patchTask` / `deleteTaskRemote` / `activeConfig` |
| `app/src/ui/TasksPage.tsx` | 删除改成「先删云端、再删本地」 |
| `app/src/ui/TaskDetailPage.tsx` | 新增「改标题」表单（PATCH 只发 `{ title }` 一个字段） |
| `docs/规格/api-contract.md` | 取舍 10 改写；第六节登记第 3、4 个接口；「明确不做的接口」表里移除这两行 |

**三个入口的关系**：

```
POST   /api/tasks       ──┐
PATCH  /api/tasks/:id   ──┼──▶  applyChanges()  →  upsert + 触发器推进 seq
DELETE /api/tasks/:id   ──┘
```

与 `POST` 的唯一行为差别是 `requireExisting`：`POST` 找不见就插入，`PATCH` / `DELETE` 找不见必须 404。

---

## 三、四项检查（课程原文逐条）

### 1. 修改检测：PATCH 改一条，页面 + 数据库两端都变

在**公网页面**上点出来的（不是 curl）：进详情 → 改标题 → 保存。

| 端 | 证据 |
| --- | --- |
| 页面 | 标题从「Day22 页面验证-改之前-2r69」变成「改之后-2r69」，页面自动刷新 |
| 数据库 | `SELECT title FROM tasks WHERE id='day22-ui-42r69'` → `Day22 页面验证-改之后-2r69` |
| 🔴 字段隔离 | 详情页四个元信息（重要度 3 星 / 预计 20 分钟 / 没设截止 / 待办）**改前改后完全一致** —— 证明 PATCH 只改了传上来的那一个字段，没把其他字段写成 null |

截图：`day22-02-PATCH-改之前的详情页.png` / `day22-03-PATCH-改之后的详情页.png`

### 2. 删除检测：页面删掉后，列表里不再出现

| 端 | 证据 |
| --- | --- |
| 页面 | 删除后这一行从列表消失（`.task-item` 计数 1 → 0） |
| 数据库 | `deleted_at IS NOT NULL = true`、`purged_at IS NOT NULL = false`、`seq = 110` |

截图：`day22-04-DELETE-删除前的列表.png` / `day22-05-DELETE-删除后的列表.png`

### 🔴 关于「GET 不再返回」的一句实话

课程的原话是「DELETE 删除后 GET 不再返回」。**我们这套接口照字面读是不成立的：
`GET ?since=` 仍然会带一次这条记录回来**（带 `deletedAt`）。

这不是没做到，是**必须这么做**：

- 行真被删掉，`?since=N` 就再也拉不到它 → **别的设备永远不知道「这条被删了」**，
  它会一直留在那台设备上，而且**任何一层都不报错**。这是静默的数据事故。
- 所以「删除」在增量同步里必须是**一次写入**（写 `deletedAt` + 推进 `seq`），
  不是一次抹除。契约第五节整节讲的就是这件事。

**等价的可验收现象**（也就是课程真正想看的东西）：

| 课程想确认的 | 我们这边怎么确认 |
| --- | --- |
| 「GET 结果里它消失了」 | 云端那次返回里它**带 `deletedAt`** → 前端 `applyRemote()` 认出来后从本机删掉 → **列表里消失、刷新也不再出现** |
| 「控制台 select 里也没有了」 | 行还在，但 `deleted_at` 有值。**真删（`purged_at`）是另一个动作**，走「清空回收站」 |

⚠️ 一句话：**在用户视角它消失了，在同步视角它必须留一条痕迹。**
把这两件事混成一件，就会做出一个「多设备之间删除不同步」的应用。

### 3. 防呆检测：操作不存在的 id

| 用例 | 结果 |
| --- | --- |
| `DELETE /api/tasks/day22-never-existed` | **404** `找不到这个任务（编号 day22-never-existed）` |
| `PATCH /api/tasks/day22-never-existed` | **404** 同上 |
| `PATCH` 带 `purge: true` | **400** `PATCH 不支持彻底删除，请用 DELETE 接口` |
| 重复 `DELETE` 同一条 | **200** + `alreadyDeleted: true`（幂等，不报红字，不再推进 `seq`） |

🔴 关键差别：**「删一个不存在的」必须报错，「重复删同一个」不该报错。**
前者是防呆缺失，后者是重试被当成故障 —— 两件事必须在代码里分开（`handleDeleteTask` 里三个分支）。

### 4. 契约同步检测

`docs/规格/api-contract.md` 第六节已登记 `PATCH /api/tasks/:id` 与 `DELETE /api/tasks/:id`，
包含请求、成功响应、错误码表，以及「为什么是软删」。取舍 10 记录了决策反转的完整过程。

---

## 四、线上抓到一个真 bug（已修并补断言）

**现象**：第一次部署后，重复 `DELETE` 同一条，返回

```json
{ "cursor": null, "alreadyDeleted": true, "deleted": { "id": "...", "seq": null, ... } }
```

`cursor` 和 `seq` 都是 `null`。

**根因**：`findByIds` 的 `select` 列表里**没有 `seq`**（写于 Day 18，那时没人用它）。
于是 `Number(undefined)` = `NaN`，`JSON.stringify(NaN)` = `null`。

**修**：`select` 补上 `seq`，并加了一条断言防回归：

```js
check('🔴 幂等分支的 cursor / seq 不是 null（findByIds 必须 select seq）', ...)
```

⚠️ `buildRow` 是**显式列举**字段拼整行的，所以这一列加进去也不会被写库（`seq` 不进 `row`）。
这个约束在 `mapper.js` 顶部写着，改 `select` 时别忘。

---

## 五、验证脚本与结果

| 脚本 | 位置 | 结果 |
| --- | --- | --- |
| `verify-patch-delete.cjs` | 本地（不进仓库） | **57/57** |
| `verify-post-tasks.cjs` | 本地 | **58/58**（新增 1 条断言） |
| `verify-rdb-tasks.cjs` | 本地 | **42/42** |
| `verify-day22-patch-delete.mjs` | 本地（跑在公网页面） | **20/20** |

`verify-patch-delete.cjs` 里最要紧的几条：

- `PATCH` 只改出现的字段（`dueAt` / `importance` / `estimateMinutes` / `status` / `createdAt` 逐个断言没被重置）
- `PATCH /tasks/A` 带 `{ id: 'B' }` → **改的是 A，B 一个字没动**
- `DELETE` 后**行还在库里**、`deleted_at` 已写、`title` 没被抹掉、`purged_at` 仍是 null
- `DELETE` 后 `GET ?since=` **能拉到这条墓碑**（这条过了才证明增量同步没被破坏）
- 跨区隔离：改 / 删别人的 id → 404，且文案不泄露「它属于别人」

---

## 六、留下的测试数据

`day22-ui-42r69` —— 故意留在库里作为**墓碑证据**（`deleted_at` 有值、`purged_at` 为空）。
它不是脏数据：`GET` 会带它回来一次，前端 `applyRemote` 会把它从本机删掉，用户看不到。
90 天后由惰性清理规则收走（契约第五节）。

---

## 七、还没做的

- ⬜ **回收站界面** —— 定稿口径（本人 10-29）：「**云端软删留痕，界面上的回收站还没做**」。
  ⚠️ 说清楚边界，别让人以为已经能找回：
  - **成立**：服务端软删，`deleted_at` 有值、行在库里，改数据库能救回来
  - **不成立**：`app/src/ui/` 下没有回收站组件；`local-indexeddb.ts:143` 明确「本机没有回收站的概念，删除就是真删」；
    本地 `Task` 还没有 `deletedAt` 字段（`cloud-sync.ts:236`），界面上表示不出「已删除」这个状态
  - 别和详情页的 `handleRestore` 混：那是「已完成 → 待办」，不是恢复已删除
  - 🔴 将来做的时候：`useTaskQueue.ts` 的过滤要改成 `status !== 'done' && deletedAt === null`，
    否则回收站里的已完成任务会漏进今日队列
- ⬜ 「余力加练」：课程建议的 `is_deleted` 标记 —— 我们的 `deleted_at` + `purged_at` 已经是它的超集，不再重复做
- ⬜ 批量操作、用户系统 —— 课程明确「今日不做」
