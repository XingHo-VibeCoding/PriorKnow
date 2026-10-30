---
name: verify-project
description: 知先 PriorKnow 的发布前检查清单，共 11 项：构建通过、生产包无开发文案、无硬编码密钥、.env 被 Git 忽略、公网首页可访问且不是错宿主、线上产物与本地构建一致、健康接口、跨域放行、读接口、写接口且 seq 在推进、预算表在。当任务涉及发布、部署、回滚、验收，或要回答「现在能不能发」时使用。
---

# 发布前检查 · verify-project

<!-- 本文件有两个同步副本，改一处必须同时改另一处，保持逐字节一致：
     ① skills/verify-project/SKILL.md           —— 入库，供 GitHub 查看与打卡截图
     ② .workbuddy/skills/verify-project/SKILL.md —— 工具实际加载的那一份（被 .gitignore 忽略）
     校验方式：两文件的 SHA-256 应完全一致；同目录的 verify.mjs 也一样。 -->

**检查项全部来自本项目真实踩过的坑，不是通用模板。** 每项都写明「怎么算通过」，禁止「看起来正常」这类判断。

## 怎么跑

两条路，结果必须一致：

```bash
# ① 一条命令跑完 11 项，逐项打印 PASS / FAIL + 证据，有 FAIL 则退出码 1
node skills/verify-project/verify.mjs

# ② 逐项手工做（抽查用）—— 下面的命令就是脚本执行的东西
```

脚本接受两个环境变量覆盖默认地址：`WEB_URL` / `API_URL`。

**输出必须长这样**（没有「基本正常」）：

```
[A1] PASS  构建通过 —— tsc + vite 无报错，dist/index.html 存在（assets/index-BwfRtTIF.js）
[B4] FAIL  跨域放行 —— 响应头没有 access-control-allow-origin（名单里少了这个 Origin）
```

## 三个地址（每次跑之前先确认）

| 用途 | 值 | 从哪来 |
| --- | --- | --- |
| 前端 | `https://priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com/` | `cloudbaserc.json` 的 `envId` + 静态托管 |
| 接口 | `https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api` | 同上，`gatewayPath` 是 `/api` |
| 探针账号 | `verify-project`（脚本自己建一条、自己删掉） | 固定值，别用真实账号 |

⚠️ **Git Bash 下写 `curl.exe`，不要写 `curl`** —— 前者是系统 curl，后者是 shell 函数，会把参数吃掉。

---

## A 组 · 本地（不联网，几十秒）

### A1 构建通过

```bash
cd app && npm run build
```

**怎么算通过**：退出码 `0`，且 `app/dist/index.html` 存在。
**为什么查**：`build` 脚本是 `tsc --noEmit && vite build` —— 类型不过就不出包。
`tsc` 报过 `TS6133`（声明未使用），那种错不会让 dev 服务器起不来，只会在出包时炸。

### A2 生产包里没有开发文案

```bash
grep -o -E "数据层状态|打卡|传智杯|Day [0-9]+" app/dist/assets/* app/dist/index.html | sort | uniq -c
```

**怎么算通过**：**没有任何输出**（2026-10-30 实测 0 处）。
**三个地方都要扫**：JS（页头徽章、开关文案）、CSS（伪元素里的文字）、`index.html`（`<title>` 与 meta）。
**为什么查**：开发版页头写着「Day 24 · 用一个真实 Bug 练习…」，右下角还挂着「数据层状态（开发用）」开关。
这两样一旦漏进构建包，等于当着评委自报作业。栽过一次，所以固化成检查项。

### A3 代码和 Git 里搜不到硬编码密钥

```bash
grep -rn -E "AKID[A-Za-z0-9]{10,}|secret(Id|Key)\s*[:=]\s*['\"][^'\"]{8,}" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.css" --include="*.html" \
  app/src app/dist cloudfunctions/api-health/*.js cloudfunctions/api-health/*/*.js db 2>/dev/null \
  | grep -v node_modules
```

**怎么算通过**：无输出。
**为什么要扫 `app/dist`**：`VITE_` 前缀的环境变量会在**构建时被内联进 bundle** —— 只扫源码，
会漏掉那些「打包之后才出现」的密钥。这条是第一次跑完检查后补上的（漏报）。
**为什么查**：CloudBase 的凭证走运行角色，代码里**不该有任何** secretId / secretKey。
`gh` 或 curl 里出现过的真 key 必须当泄漏处理（换 key，而不是删行）。

### A4 `.env` 被忽略、`.env.example` 在仓库、历史里没有 `.env`

```bash
git check-ignore -q .env && echo "ignored" || echo "NOT-IGNORED"
git ls-files .env.example
git log --all --name-only --pretty=format: | sort -u | grep -E "^\.env($|\.)" | grep -v "\.env\.example"
```

**怎么算通过**：三件事同时成立 —— 第一行输出 `ignored`；第二条打印出 `.env.example`；
第三条**无输出**（历史上从没提交过 `.env`）。
**为什么查**：`.gitignore` 只挡「将来」的提交。已经进过历史一次，忽略规则再全也没用 —— 得改 key。

---

## B 组 · 线上（要网，冷启动可能 3–4 秒）

### B1 首页可访问，且不是打错宿主

```bash
curl.exe -s -w "\ncode=%{http_code} type=%{content_type}\n" "$WEB_URL" -o /tmp/live.html
```

**怎么算通过**：`code=200` **且** `type` 含 `text/html` **且** `/tmp/live.html` 里**不含** `NoSuchKey`。
**为什么查**：`text/html` + `NoSuchKey` = 请求打到了静态托管而不是云函数，是最常见的「明明部署了却 404」。
⚠️ 浏览器直访还会撞「默认域名中间页」（只对 `Sec-Fetch-Mode: navigate` 生效，且**返回 404**）——
那是 curl 200 / 浏览器 404 的第二种成因。**脚本走 curl，验不了那一层，只能人工过闸。**

### B2 线上产物 = 本地构建

```bash
grep -o 'assets/index-[A-Za-z0-9_-]*\.\(js\|css\)' app/dist/index.html | sort -u
grep -o 'assets/index-[A-Za-z0-9_-]*\.\(js\|css\)' /tmp/live.html | sort -u
```

**怎么算通过**：两行输出**逐字相同**（文件名带 content hash，哈希变了就是内容变了）。
**为什么查**：判「部署生效」不能拿 `tcb hosting list` 的时间戳，也不能拿 `*.webapps` 域名返回 200 —— CDN 有缓存，
这两个证据都撒过谎。**唯一可信的是 `index.html` 里那个 hash 换没换。**

### B3 健康接口

```bash
curl.exe -s -w "\ncode=%{http_code}\n" "$API_URL/health"
```

**怎么算通过**：`code=200`，响应体 JSON 里 `ok === true` 且 `data.service === "priorknow"`。
**为什么查**：`ok` 字段是统一响应壳的招牌；少了它说明打到了别的东西（网关原生 JSON 就没有 `ok`）。

### B4 跨域放行 —— **只看响应头，不看状态码**

```bash
curl.exe -s -i -X OPTIONS \
  -H "Origin: $WEB_URL" -H "Access-Control-Request-Method: POST" \
  "$API_URL/tasks" | grep -i "access-control-allow-origin"
```

**怎么算通过**：**有输出**，且值等于上面那个 Origin。
**为什么查**：CloudBase 网关按「安全域名名单」放行，**不是反射任意 Origin**。
名单外仍然回 `204`（所以状态码看起来完全正常），只是**没有** `allow-origin` 头。
栽过一次：状态码全绿，浏览器里每个请求都失败。**必须看头。**

### B5 读接口 —— 必须读回「刚写进去的那条」

```bash
# ① 先写一条（id 用 verify-read-<时间戳>）
# ② 用「刚才那条的 cursor − 1」当 since 拉回来
curl.exe -s -H "X-User-Id: verify-project" "$API_URL/tasks?since=<cursor-1>"
# ③ 删掉探针
```

**怎么算通过**：`code=200` 且 JSON 的 `ok === true`；`items` 里**能按 id 找到刚才写的那条，标题逐字相同**；删除回 `200`。
**为什么查**：只读一次空库什么都证明不了 —— `{ok:true, items:[]}` 既可能是「真空库」也可能是「读不出来但壳是对的」。
`app.rdb()` 失败**不抛异常**，回来是 `{status,data,error}`，靠 `queryAll()` 才变成 `ok:false`。
**判据必须是「刚写的那条在不在、内容对不对」**，不是「有没有报错」。

### B6 写接口 —— 并且 `seq` 在推进

脚本自动跑这三步（建 → 改 → 删），关键断言是**第二步的 cursor 大于第一步**：

```bash
# ① 建一条
curl.exe -s -X POST -H "X-User-Id: verify-project" -H "Content-Type: application/json" \
  -d '[{"id":"verify-<时间戳>","title":"发布前检查探针","status":"todo","importance":2,"estimateMinutes":30}]' \
  "$API_URL/tasks"
# ② 改标题（PATCH），看返回的 cursor 是否比 ① 大
# ③ 删（DELETE），看是否软删（alreadyDeleted 幂等）
```

**怎么算通过**：① `201` 且 `cursor > 0`；② `200` 且 `cursor` **严格大于** ① 的 cursor；③ `200`。
**为什么查**：
- `seq` 由 `BEFORE UPDATE` 触发器推进。触发器一旦被漏掉或建失败，改了一个字的任务**永远不会被别的设备拉到**，
  而且不报错 —— 只能靠「cursor 有没有变大」证明它还活着。
- `DELETE` 必须是**软删**（墓碑）。行真删了，`?since=N` 就拉不到它，别的设备永远不知道你删过 ——
  同样不报错。「用户视角消失，同步视角留痕」。
- `PATCH` / `DELETE` 找不见必须 `404`，不许假装成功。

### B7 预算表在（第二张表）

```bash
curl.exe -s -w "\ncode=%{http_code}\n" -H "X-User-Id: verify-project" \
  "$API_URL/budget?date=2026-01-01"
```

**怎么算通过**：`code=200` 且 `ok:true`（`data` 里没有这一行也正常 —— 那是「还没填」，不是错）。
**为什么查**：`tasks` 和 `daily_budget` 是两张表。只查任务表，第二张表不存在时照样全绿。
`daily_budget` 的建表脚本是 `migrate-03-budget.sql`，**刻意没并进 `schema.sql`**（并进去会被 `DROP` 带走）。

---

## 故意弄坏一次（证明它不是摆设）

**每次改完检查项，至少弄坏一项、跑一次，确认对应项变 FAIL。** 只跑对的一遍，证明不了任何事。

| 弄坏什么 | 应该变 FAIL 的项 | 改回来 |
| --- | --- | --- |
| 前端某个开发文案留着不删，重新构建 | A2 | 删文案、重建 |
| 在 `app/src` 里塞一行 `const secretKey = 'AKIDfakefakefake'` | A3 | 删行 |
| 把 `.env` 从 `.gitignore` 里去掉 | A4 | 加回 |
| 请求一个不存在的接口路径（把 `/health` 写成 `/helth`） | B3 | 改回 |
| 用一个不在安全域名名单里的 Origin 发 OPTIONS | B4 | 换回真 Origin |
| 把拉取起点改成 `since=<刚写的 cursor>`（跳过刚写那条） | B5 | 改回 `cursor-1` |

**做完必须改回来，再跑一次全 PASS。** 弄坏不还原比不检查更糟 —— 下次你会以为它就是坏的。

## 输出格式

- 逐项一行：`[编号] PASS|FAIL  项目名 —— 证据`。证据是**能核对的原始值**（状态码、文件名、响应头、哈希）。
- 末尾一行合计：`11 项：PASS n / FAIL m`。
- 有 FAIL 时退出码 `1`，没有时 `0`（这样能直接挂到任何「命令失败就停」的地方）。
- **不写「基本没问题」「看起来正常」。** 判不出来就是 FAIL，并说明缺什么证据。

## 这套检查**不覆盖**什么

写清楚边界，比假装覆盖全部更可信：

1. **默认域名中间页**（只对浏览器导航生效，curl 看不到）——人工过闸。
2. **前端交互对不对**（点了有没有反应）——那是 `frontend-guidelines` 和 Day 24 测试清单的事。
3. **数据正确性**（同步之后两边是否一致）——有专门的回归脚本（三情况 / 换号 / 欠条补发）。
4. **接口身份认证** —— 现在**没有**（`X-User-Id` 客户端自报，知道地址就能读写任何人的分区）。
   这是已知缺口，不是本 Skill 能查出来的「故障」。
