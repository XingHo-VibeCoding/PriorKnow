# 知先 PriorKnow · 云端资源笔记

> 课程第 1195 行要求的「项目笔记」：CloudBase 开通时**顺手记下环境 ID、剩余额度、到期日期**三项。
> 理由写在课程里——「免费体验额度有到期时间，到期后你的公网网站会打不开，而且不会提前很久提醒你」。
> Day 26 会有一次专门的额度检查（课程第 259 行），这份笔记就是那天的对照底稿。

---

## 环境三项（已齐）

| 项 | 值 |
| --- | --- |
| **环境 ID** | `priorknow-d0go4uh2uc0f62465` |
| **默认域名（安全域名）** | `priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com` |
| **数据库类型** | **PostgreSQL**（控制台「PostgreSQL 管理」页已确认） |
| **套餐** | 云开发**免费体验版**（体验版，**不支持自动续费**） |
| **剩余额度** | **3000 / 3000 点** —— 套餐资源点**一个没动**（套餐有效期 2027-04-05 起算，当月额度未消耗） |
| **到期日期** | **2027-04-05**（= 今天 + 181 天，正好 6 个月） |

📸 **证据**：仓库根 `screenshots/day15-控制台套餐与额度.png`（含「套餐有效期至 2027-04-05」
「套餐资源点：0 点 / 3000 点」「体验版不支持自动续费」三项同框）

### ⚠️ 截图里还藏着一条重要信息：免费体验版的功能限制

控制台「当前套餐能力」栏原文：

| 能力 | 免费体验版 |
| --- | --- |
| 资源点配额 | ✅ 3000 点 |
| Serverless 服务（PostgreSQL 数据库 / 云存储 / 云函数） | ✅ |
| 内置模型部分支持（流式等），支持 AI Agent 开发 | ✅ |
| **不支持加购资源包和开启按量付费** | ✅（即：超额直接停用，不会自动扣费） |
| 升级更多能力（资源点配额 4 万点 / 云函数时长 900 秒 / 固定出口 IP / 环境 QPS 500） | ❌ 需升级 |

→ **「不支持加购资源包和开启按量付费」是好事**：课程第 3310 行担心的是「被引导开按量计费然后悄悄扣费」，
这套东西在体验版里**根本不存在**，超额就是停用。**不会有意外扣款的风险。**
→ **但 QPS 500 / 函数时长 900 秒** 这两个上限要知道 —— Day 17–19 写接口时别设计超时很长的操作。

### ⚠️ 控制台还给了另一条续期路径（比官方文档更具体）

「**免费续期任务流程**」三步：

1. **连平台发内容** —— 到小红书 / 掘金 / 知乎 / CSDN / B站 / X / V2EX / 即刻发布 CloudBase 相关内容
2. **贴链接传截图** —— 回控制台粘贴分享链接 + 上传截图（jpg/png/jpeg，≤ 10MB）
3. **验证通过 0 元续期** —— 混元 AI 自动验证 → 通过即**0 元续 6 个月**

→ 比「到期前 1 个月内手动续费」更省事，**不需要等到期前一个月**。
→ 若 2027-04-05 前想续，**走这条路**（免费）。

### 关于这三项能不能公开（课程第 245 行）

- **环境 ID 不是密钥**，可以公开、进代码、写进笔记（`TECH_DESIGN.md` 第 245 行已注明）。
- **默认域名也可以公开** —— 它本来就是别人要访问你页面的地址。
- ⚠️ **但这三项里没有一项是密钥**，真正的密钥（云函数的环境变量、数据库连接串）
  **只放CloudBase 控制台，绝不写进代码、绝不提交仓库**（`TECH_DESIGN.md` 第 246 行）。

---

## 免费体验版的规则（2026-01-16 起，官方口径）

| 规则 | 内容 |
| --- | --- |
| 额度 | **3000 资源点/月** |
| 单次有效期 | **6 个月** |
| 续费 | **到期前 1 个月内**可续 6 个月，**仍然 0 元** |
| 自动续费 | **不支持**。也不会自动转付费 |
| 加购资源包 / 按量付费 | 免费环境**不支持**（要先升级为付费套餐） |
| 数据什么时候会丢 | **环境销毁才会丢**。课程第 3185 行的对策：代码在 GitHub 永久保存；数据靠到期前导出的备份；**公网地址是租来的，会到期** |

⚠️ **一条与本项目无关但要知道的坑**（官方原文）：
「免费体验版环境在**小程序发布**后，环境的到期时间变更为**上线后的第 15 天**，到期后进入停服隔离期，隔离期未转付费将销毁环境。」
→ **本项目是 H5 / PWA，不发小程序，所以不适用**。若日后要加小程序，这一条立刻生效。

---

## ⚠️ 额度其实很紧，别小看 3000 点

⚠️ **先澄清一件容易搞错的事**：控制台那3000 点是**「每月」的额度**（套餐价目表原文：
「3,000 resource points per month」）。官方《套餐及资源包说明》明确：
> **账期日 = 购买日记**，**「云开发资源中的按月累计资源将在每个账期日进行资源重置」**
> （例子：2026-01-01 买 2 个月，账期日每月 1 日，即 2 月 1 日按月资源重置）

→ **不累积**。今天（10-05）是账期日，**这个月的 3000 点**到 11-05 就重置。
→ 顺带算出**账期日 = 每月 5 日**（今天 10-05 开的环境，每月 5 日重置月度额度）。

按官方价目算，**每月 3000 点能跑多少**：

| 资源 | 消耗 | 每月 3000 点能撑 |
| --- | --- | --- |
| **静态托管流量** | 210 点/GB | **仅约 14 GB** ← 真正的瓶颈 |
| 云函数调用 | 13.3 点/万次 | 约 **225 万次** |
| 云函数外网出流量 | 800 点/GB | 约 **3.7 GB** |
| 云存储容量 | 3.94 点/GB/天 | 约 761 GB |

→ **瓶颈在静态托管流量，不在调用次数**（1 万次页面访问流量费才 2.1 点，
但**流量是 210 点/GB** —— 下载一次 5 MB 的 JS bundle 就烧掉约 1 点）。
→ **省着用**：课程期间不要反复重传大文件、不要跑压测、不要挂视频。
→ **Day 26 做资源检查时，第一眼看「静态托管流量」这一项。**

### ⚠️ 超额会怎样：会降级，但**不会烧钱**（Day 16 起要记住）

官方规则（体验版「不支持加购资源包和开启按量付费」）：

| 情况 | 结果 |
| --- | --- |
| 当月资源点用完 | **环境进入「降级」状态**：数据库、存储、CDN、调用次数等**全部不可用** |
| **会不会自动转按量计费** | **不会** —— 体验版根本没有这个开关，**不存在意外扣费** |
| 什么时候恢复 | ①升级套餐 ②（体验版不行）③ **进入下一个计费周期，套餐内配额刷新，自动恢复环境** |

→ 官方原文：「**当进入下一计费周期，套餐内配额刷新，也将自动恢复环境**」。
→ **好消息**：万一某个月用超了，**等下个月 5 日自动恢复**，不用做任何操作，**也不用付钱**。
→ **坏消息**：**当月剩下的日子页面就打不开了** —— Day 20–28 的验收若撞上超额月会很麻烦。
→ **对策**：课程期间**每月 5 日之后**留意一下用量，别让关键验证日撞在超额的月份里。

---

## 备案：**本项目不需要**

| 做什么 | 要备案吗 |
| --- | --- |
| 用默认域名跑 `/api/health` 与前端页面 | **不用** |
| 部署云函数 / 静态托管 | **不用** |
| 绑自己的域名 | **要** —— 且**免费体验版根本不支持备案**（官方准入：个人版及以上、剩余有效期 > 6 个月、云托管固定 IP） |

⚠️ **默认域名会有「访问提示中间页」**（官方规定）：浏览器直接打开 `*.tcloudbaseapp.com` 访问资源时，
会先弹一个提示页，访客点「确定访问」才进真页面。理由是「默认域名下的内容未经前置备案与人工审核，
根据监管要求必须履行提醒义务」。

→ **影响截图**：今天拍公网地址时要连点两次才截得到干净画面。
→ **影响 Day 14 那位同伴**：他打开你发的链接也会看到这个，别以为是打不开。

---

## 待填 / 待办

**已完成**：剩余额度（3000/3000 点）、到期日期（2027-04-05）、数据库类型（PostgreSQL）。

- ✅ **`/api/health` 的公网访问地址**（2026-10-05 19:40 已通，7/7 用例通过）：
  ```
  https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api/health
  ```
  ⚠️ **域名和静态托管那个不是同一个**：
  `*.service.tcloudbase.com` → **HTTP 云函数**（这个）；
  `*-1489177462.tcloudbaseapp.com` → **静态托管**（板块③ 传前端页面用）。

  | 请求 | 结果 |
  | --- | --- |
  | `GET /api/health` | `200` `{"ok":true,"service":"priorknow","time":"..."}` |
  | `GET /api/ping` | `200` 同上（等价别名） |
  | `GET /api/health/` | `200` 同上（尾斜杠容错） |
  | `GET /api/health?ts=1` | `200` 同上（查询串容错） |
  | `GET /api/tasks` | `404` `{"ok":false,"error":"not_found","path":"/tasks"}`（今天没实现） |
  | `POST /api/health` | `405` `{"ok":false,"error":"method_not_allowed"}` |
  | `DELETE /api/ping` | `405` 同上 |

  ⚠️ **刚部署完的第一次请求可能返回 400 `FUNCTIONS_PARAM_INVALID`**，
  紧接着第二次就 200 —— 那是网关路由生效的短暂窗口，**不是坏了**。
  **连续刷两次都 200 才算通过**（我就差点把单次 400 误判成「平台保留路径」）。

  ### 浏览器验收（2026-10-06 08:24，已通过）

  浏览器打开该地址，**含地址栏与返回的 JSON** —— 课程第 1210 行的第一张图即此图。

  **云端时钟与本地同步核对**（证明代码真在云上跑，不是缓存）：

  | | 时间 |
  | --- | --- |
  | 本地 UTC | `2026-10-06T00:24:22Z` |
  | 云端第 1 次 | `2026-10-06T00:24:26.216Z` |
  | 云端第 2 次 | `2026-10-06T00:24:28.606Z` |
  | 云端第 3 次 | `2026-10-06T00:24:30.955Z` |

  ⚠️ **截图要刷新后重截**：现有那张的 `time` 是
  `2026-10-05T12:47:19.671Z`（UTC）= **北京时间 10-05 20:47**。
  `ok` / `service` 都对，但**时间戳证明是昨晚截的** ——
  静态截图无法证明「实时性」，判断实时性要看两次的时间差。

  📸 重新截图时**地址栏保持完整** —— 里面有**完整环境 ID**
  （`priorknow-d0go4uh2uc0f62465`），正好补上另一张控制台图缺的项。

  部署命令（四个参数都不能少）：
  ```bash
  tcb fn deploy api-health --httpFn --install-dependency false --force
  ```
  ⚠️ **不要传 `--path`** —— 它与配置文件里的 `gatewayPath: "/api"` 冲突，路由会坏。

- ⬜ **云函数公网地址的验证截图**（Day 15 三张图之二）
- ✅ **前端公网页面地址**（2026-10-06 17:46 已部署，CDP 实测通过）：
  ```
  https://priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com/
  ```
  **CDP 真点实测**（过「访问提示中间页」之后）：
  | 检查项 | 结果 |
  | --- | --- |
  | 页头徽章 | `Day 13 · 三个视图 · 四种状态` ✅ |
  | 导航两标签 + 高亮 | 「今日队列」「全部任务」，点后者 → `/tasks` 且高亮 ✅ |
  | 开发开关 `.dev-bar` | 在 ✅ |
  | 空态 | 「队列是空的」+「载入示例数据」按钮 ✅ |
  | 载入示例数据 | 写入成功 → **7 件待办**，首条 79.5 分 ✅ |
  | 资源引用 | `./assets/...`（`base: './'` 生效）✅ |
  | `/tasks` 直接访问 | **404**（静态托管无 History 回退，已知限制）|

  ⚠️ **两个必须知道的现象**：
  1. **首次打开会弹「访问提示中间页」**（官方规定：默认域名未经前置备案），
     要点「确定访问」。**这个按钮必须用真实鼠标事件点**，
     `.click()` 不触发它的 Vue 绑定（实测返回 `clicked` 但页面没跳）。
  2. **页面数据是空的** —— 数据在各自浏览器 IndexedDB 里，
     点「载入示例数据」才有（课程第 1283 行明说这是对的）。

  📸 截图：仓库根 `screenshots/day15-前端公网页面-全部任务视图.png`
  （另存了中间页那张 `day15-访问提示中间页-含环境ID.png`，
  **它含完整环境 ID**，可补另一张控制台图缺的项）。

  ⚠️ **重新部署命令**（云端构建走不通，见 `day15-frontend-deploy.md` 第三节）：
  ```bash
  cd app && npm run build && cd ..
  tcb hosting deploy ./app/dist / -e priorknow-d0go4uh2uc0f62465
  ```
  **不要加 `--safe`**（会误报校验失败并自动回滚）。
- ⬜ **确认没开按量计费** —— ✅ **已确认不需要担心**：
  体验版「不支持加购资源包和开启按量付费」，控制台上没有这个开关，**不可能被自动扣费**
- ⬜ **Day 26 资源检查** —— 先看「静态托管流量」这一项

---

## 十二、Day 18 补：两条必须会的运维命令（本来以为没有）

Day 18 部署 POST 时连撞两个坑，都是"以为做不到、其实 CLI 一直支持"：

### 1. `tcb db execute` —— 命令行直接执行 SQL

以前一直以为改库只能进控制台 SQL 编辑器，**其实 CLI 3.8.5 就有**：

```bash
tcb db execute -e priorknow-d0go4uh2uc0f62465 --sql "SELECT 1"
tcb db execute -e <envId> --json --sql "SELECT ..."      # JSON 输出，方便脚本处理
tcb db execute -e <envId> --role postgres --sql "..."    # 指定角色
```

- **支持多语句**（用 `;` 隔开），也支持 `DO $$ ... $$` 块（`$` 在 bash 里要转义成 `\$`）。
- `--json` 的返回是 `{data:{Columns, Rows, AffectedRows, ExecutionTimeMs}}`，
  `Rows` 里每一行是**一个 JSON 字符串**（不是对象），要再 parse 一次。
- ⚠️ 它**不走云函数、不需要函数凭证**，是环境级管理通道 → 以后建表/改权限/查数据都不用开控制台了。
- 但**上线后仍禁止执行 `db/seed.sql`**（会清数据），这条纪律不变。

### 2. `tcb logs search` —— 真正能用的日志命令

🔴 **`tcb fn log` 在本环境是坏的**：无论加不加 `-e`、加不加时间窗，一律返回
`No invocation logs`，而实际**有**调用。别在它上面浪费时间。

能用的那条：

```bash
tcb logs search -e <envId> --limit 20
tcb logs search -e <envId> -q 'function_name:"api-health" AND log:"写入失败"'
```

- ⚠️ `tcb fn log -e` 里的 `-e` 是 **"--error 只看错误日志"**，**不是环境 id**；
  环境 id 要用 `-e/--env-id`（两个命令的短选项撞车，很容易搞错）。
- 返回里有 `log`（日志正文）和 `ret_msg`（函数返回值），**排错时两个都要看**。

### 3. 本次真正撞上的坑：`anon` 角色没有写权限

| 现象 | POST 返回 500，函数日志 `permission denied for table tasks`（`42501` / HTTP 401） |
|---|---|

实测权限（`information_schema.role_table_grants`）：

| 角色 | tasks 表权限 |
|---|---|
| `anon` | **只有 SELECT** ← 云函数的凭证被映射成这个角色 |
| `authenticated` | 全权 |
| `service_role` | 全权 |

- 🔴 **云函数用 `getClientCredential()` 调用 `app.rdb()`，落到的是 `anon`**，不是 `service_role`。
- 🔴 根因是 Day 16 的 `schema.sql` **只建结构、一句 GRANT 都没写**（默认 `public` schema 给 PUBLIC 授了 SELECT），
  所以 Day 17 的 GET 一直通、洞被盖住了。
- 修复见 `db/migrate-02-grant-write.sql`（只给 `anon` 补 SELECT/INSERT/UPDATE/DELETE + 序列权限）。
- 🔴 **identity / serial 列背后的 SEQUENCE 要单独授权**，给表授 INSERT 不会自动给序列权限。

---

## 十三、本机命令一律按 PowerShell 写（不要给 bash 语法）

🔴 **踩过的坑**：Day 19 我给的项目检查命令是 bash 语法，在他机器上直接报
`ParserError: 循环中缺少语句体 do`。他的终端是 **pwsh 7** —— **不是 bash，
给他复制粘贴的命令必须按 PowerShell 写。**

### 13.1 语法对照（bash → PowerShell）

| 想干什么 | ❌ bash 写法 | ✅ PowerShell 写法 |
|---|---|---|
| 续行 | 行尾 `\` | 行尾反引号 `` ` ``（**后面不能有空格**） |
| 管道后遍历 | `\| while read f; do … done` | `\| ForEach-Object { … }` |
| 数行数 | `wc -l` | `(Get-Content $f -Encoding UTF8).Count` |
| 找文件 | `find . -name "*.js"` | `Get-ChildItem -Recurse -Filter *.js` |
| 搜内容 | `grep -n "x" f` | `Select-String -Path f -Pattern "x"` |
| 串联命令 | `A && B` | pwsh 7 支持 `&&`；5.1 不支持（用 `;` 或 `if ($?) { }`） |
| HTTP 请求 | `curl -s -w …` | **必须写 `curl.exe`** —— 5.1 里 `curl` 是 `Invoke-WebRequest` 的别名，参数完全不同 |

### 13.2 🔴 `Get-Content` 的编码坑（会算错行数）

PowerShell 5.1 的 `Get-Content` **默认按系统 ANSI（中文环境是 GBK）解码**，
而我们的文件是 **UTF-8 无 BOM**。GBK 是双字节编码，遇到 UTF-8 的中文字节时
会把紧随其后的 `\n` 当成"第二个字节"吃掉 → **行数少算**。

实测：`index.js` 真实 **211 行**，`Get-Content` 不带 `-Encoding` 算出来是 **152 行**。

- ✅ 一律写 `Get-Content $f -Encoding UTF8`
- pwsh 7 默认就是 UTF-8，写上也无害 —— 这条命令在 5.1 / 6 / 7 上都对

### 13.3 四条常用命令（可直接复制）

**① 云函数的文件结构与行数**（Day 19 打卡图一用这条）

```powershell
$root = "$PWD\cloudfunctions\api-health"
Get-ChildItem $root -Recurse -Filter *.js |
  Where-Object FullName -notlike '*node_modules*' |
  Sort-Object FullName |
  ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1)
    '{0,4} 行  {1}' -f (Get-Content $_.FullName -Encoding UTF8).Count, $rel
  }
```

**② 证明查询已经被关进数据层**（`from('tasks')` 只该出现在 `data\` 下）

```powershell
$root = "$PWD\cloudfunctions\api-health"
Get-ChildItem $root -Recurse -Filter *.js | Where-Object FullName -notlike '*node_modules*' |
  Select-String -Pattern "from\('tasks'\)" |
  ForEach-Object { $_.Path.Substring($root.Length + 1) + "  第 " + $_.LineNumber + " 行" }
```

**③ GET 接口（带自定义头）**

```powershell
curl.exe -s -w '`nHTTP %{http_code}`n' -H "X-User-Id: demo-user-001" `
  "https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api/tasks"
```

⚠️ `-w` 里的换行：**单引号**包住时写 `\n` 会被 curl 原样收到（可用）；
**双引号**包住时 PowerShell 会先解析，要写反引号 `` `n ``。两种都行，别混着来。

**④ POST 接口** —— 外层用**单引号**，里面 JSON 的双引号才不会被 PowerShell 吃掉：

```powershell
curl.exe -s -X POST "https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api/tasks" `
  -H "Content-Type: application/json" -H "X-User-Id: demo-user-001" `
  -d '[{"id":"ps-test-01","title":"PowerShell 发的一条"}]'
```


---

## 十四、Day 19 补：前端第一次真的调接口，踩出来一个数据丢失洞

### 背景

第 3 周做完了云函数，但**前端一次都没调过它** —— 之前所有验收都是 `curl` 发的。
「前端两层校验都生效」这句话当时只有代码上的依据，没有证据。
所以补了一块「云端同步（试运行）」：`app/src/data/cloud-sync.ts` + `app/src/ui/CloudSyncPanel.tsx`，
真浏览器、真请求、真库。

### 🔴 洞：跨区同 `id` 会把别人的整条任务搬走

**怎么发现的**：验证时用 `demo-user-002` 推一份「载入示例数据」造出来的 7 条任务
（`sample-01`…`sample-07`，id 是写死的）。推完接口回 `201 accepted`。
然后查库发现：**`demo-user-001` 的那 7 条不见了，`demo-user-002` 多了 7 条 —— id 完全一样。**

**根因链条**（三句就能说清，但每一句单独看都「没问题」）：

1. `id` 是**全局主键**；
2. `findByIds(ids, userId)` 带了 `user_id` 过滤 → 别人的行在本区看来**等于不存在**；
3. 「不存在」→ 走插入分支 → `INSERT … ON CONFLICT (id) DO UPDATE` 的冲突分支
   把**整行连同 `user_id`** 一起覆盖 → 行换了主人。

**为什么会回 201 而不是报错**：因为整条链路上没有一步认为这是异常。
这正是它危险的地方 —— 静默、无日志、无告警，用户 A 只会发现自己的任务消失了。

**修法**（`tasks/handlers.js` ⑤ 之前）：

```js
const owners = toInsert.length > 0
  ? await tasksRepo.findIdOwners(toInsert.map((c) => c.id))   // 不带 user_id 过滤，查全表
  : new Map()
// 有主但主人不是本区 → 拒
if (owner !== undefined && owner !== userId) {
  rejected.push({ index: c.index, field: 'id', reason: `找不到这个任务（编号 ${c.id}）` })
}
```

- ⚠️ 只在「本区查不到的 id」上才多查一次，正常新增（全新 id）时是空转。
- ⚠️ 文案必须用「找不到这个任务」，**不能**写「它属于别的用户」——
  后者等于确认这个编号存在（与契约「404 与 403 合并」同一个理由）。
- ⚠️ 代价：用户真换了 `user_id`（换账号/换身份），旧行会全部推不上去。
  这是**故意选的**：搬走别人的行比推不上去坏得多。

回归用例在 `verify-post-tasks.cjs` 第 ⑧ 组（7 项）：别人抢不走、条数不变、
归属不变、内容不变、同区重推仍按「修改」处理。

### ⚠️ 测试时的坑：别用固定 id 的示例数据跨区推

`sample-01`…`sample-07` 是**写死的 id**，所以它们天然会撞主键。
做跨区测试要么换一批全新 id，要么先用 SQL 清掉目标区：

```
tcb db execute -e priorknow-d0go4uh2uc0f62465 --sql "DELETE FROM tasks WHERE user_id='demo-user-002';"
```

同区重跑也要清 —— 不清的话第二次会撞「相同标题的待办已经存在」（409），
看起来像 bug，其实是判重按设计工作了。

### 📌 顺带确认的两条

1. **CORS 不用配也能用 —— 但机制不是「反射任意 Origin」**（10-28 修正）。
   网关按**安全域名名单**决定回不回 `access-control-allow-origin`：
   名单内的（`localhost:*`、已登记的自有静态托管域名）→ 回；名单外的 → 也回 204，
   但**不带 `allow-origin`**，浏览器照样拦。名单用 `tcb cors list -e <envId>` 查。
   本地 `http://localhost:5173` 直连云函数地址**没有跨域问题**，不需要 Vite 代理。
   ⚠️ **判断通没通看响应头里有没有 `allow-origin`，不看状态码** —— 被拒也是 204。
2. **`POST` 的 `cursor` 不能当 `since`**（已写进契约第七节）。
   它是「本区最大 seq」，直接当游标会跳过「别的设备写在它之前、本机还没拉」的记录。
   本地游标只由 `GET` 返回的 `cursor` 推进。

### 慢的时候有多慢

冷启动后第一次 POST 实测 **2.9–4.0 秒**（`x-cloudbase-upstream-timecost: 4053`）。
前端超时给到 90 秒，别按「几百毫秒」设计。

---

## 十五、Day 20：部署到公网，以及这一路上真正会绊人的三件事

### 1. 部署本身（两条命令，别加参数）

```bash
cd app && npm run build
tcb hosting deploy ./app/dist "/" -e priorknow-d0go4uh2uc0f62465
```

- **不加 `--safe` / `--verify`**：会误报失败并回滚。
- 🔴 Git Bash 下 `"/"` 会被 MSYS 换成 `C:/Program Files/...` —— 报
  `No files found under path "C:/Program Files/WorkBuddy/..."` 就是这个原因。
  必须加 `MSYS_NO_PATHCONV=1` 或改用 PowerShell。
- 部署只是**覆盖同名文件**，不会删旧产物。旧的 `assets/index-xxxx.js` 会一直堆着，
  手动 `tcb hosting delete "/assets/index-<hash>.js"` 清掉。
  ⚠️ 顺序：**先传新的、等 CDN 切到新 index.html，再删旧的**，否则中间那几分钟
  旧 index.html 会指向已删的 JS，页面白屏。
- 判线上生效：`curl -H "Cache-Control: no-cache" <host>/index.html | grep assets/`，
  看 js 的 hash 换了没有。**不要用 `tcb hosting list` 的时间戳当证据**（那是上传时间）。

### 2. 🔴 刷新 `/tasks` 404 —— 静态托管不做 History 回退

静态托管只认文件路径：地址栏是 `/tasks` 就去桶里找 `tasks` 这个文件，找不到回 404，
**React 根本没机会启动**。CLI 里也没有任何「错误页 / 重写」配置项，走不通。

解法是改用 **HashRouter**（`app/src/main.tsx`，一行）：`#` 之后的内容浏览器不发给服务器，
服务器永远只看到 `/`，永远回 `index.html`。代价是地址多一个 `#`（`/#/tasks`）。

验证过了：`/#/tasks` 上刷新、直接分享深链都能打开。

### 3. 🔴 中间页：`curl` 200、浏览器 404，跟跨域无关

默认域名（`*.tcloudbaseapp.com`）**只对浏览器直访**展示「风险提醒」中间页，
而且**状态码是 404**。判断依据是请求头 `Sec-Fetch-Mode: navigate` —— 所以：

- `curl` 拿到 200（curl 不发这个头，也不像浏览器）
- 浏览器拿到 404 + 一张要你点「确定访问」的页面

这就是「curl 通、浏览器不通」的**第二种**成因（第一种是跨域）。
区分方法：看**响应体**，中间页的 body 里写着「风险提醒」「测试域名」。

中间页的实测细节：
- 按钮上带倒计时「确定访问 (1s)」，**倒计时期间点它没反应**，要等括号消失再点。
- 点一次之后在 Cookie 有效期内不再弹（官方文档原话）。
- 🔴 **去掉中间页的唯一合规途径是绑一个已备案的自定义域名**，测试域名去不掉。
  所以截图和分享链接都要接受「先点一次确定访问」。

### 4. CORS：其实早就配好了

`tcb cors list -e priorknow-d0go4uh2uc0f62465` 显示安全域名名单里第一条就是
`priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com`（10-05 建环境时就有了）。

所以「控制台配跨域」这一步**不是修 bug，是把隐式放行变成显式白名单**（本来就在名单里）。
配完页面行为一点没变，是正常的。**不许填 `*`** —— 那等于拆掉同源策略。
平台自带的 `tcb.cloud.tencent.com` 等条目是官方的，别删。

### 5. 完成标准怎么验（脚本已写，结论在此）

| 标准 | 验法 | 结果 |
| --- | --- | --- |
| 公网首页展示真库数据 | 干净 context 打开 → 首页 0 件（证明不来自本机）→ 配置后拉取 → 8 件 | ✅ |
| 控制台改数据刷新跟着变 | SQL 改标题 → seq 推到 86 → 点拉取只回 1 条 → 新标题上屏 | ✅ |
| F12 里请求地址是公网地址 | 抓包：`GET https://…service.tcloudbase.com/api/tasks?since=0` | ✅ |
| 深链刷新不 404 | `/#/tasks` 刷新后仍渲染 | ✅ |
| 控制台无报错 | 无 JS 运行时错误、无失败资源（favicon / 中间页除外） | ✅ |

脚本在 `~/.workbuddy/binaries/node/workspace/verify-day20-public.mjs`（12 项）
与 `verify-day20-roundtrip.mjs`（7 项），都不进仓库。

### 6. 两个写脚本时踩的坑

- 🔴 `tcb db execute` 把表格打在 **stderr** 上，只收 stdout 是空串 → 必须 `2>&1`。
- 🔴 表格里有 **ANSI 颜色码**（`│` 和数字之间夹 `\x1b[39m`）→ 不剥掉正则永远匹配不上。
  `raw.replace(/\x1b\[[0-9;]*m/g, '')`。
- 🔴 直接 `goto` 到 `${HOST}#/tasks` 会白跑：中间页点「确定访问」后重定向回根路径，
  hash 被丢掉。必须**先过闸、再点导航**。
