# docs/ — 文档索引

> Day 16（2026-10-08）整理。此前 15 份 `.md` 混在仓库根目录，
> 现在按**角色**分三类。**只有文件名变了，内容一字未改。**

## 规格/ — 需求与设计（要改产品行为时看这里）

| 文件 | 什么时候读它 | 一句话 |
| --- | --- | --- |
| `项目描述.md` | 想知道「这个产品到底是什么」 | 产品总纲。**参赛设想只在这里**，不写进界面 |
| `research.md` | 想知道「为什么和别人不一样」 | 竞品调研（Day 3）。结论：三家都在「记录」层卷，没人回答「为什么是这件」 |
| `PRD.md` | 要确认某个功能做没做、验收过没过 | 产品需求（Day 4）。MVP 9 项功能 + **17 条验收标准** |
| `TECH_DESIGN.md` | 要动代码结构或数据层 | 技术设计（Day 5）。三层分工、数据模型、`priority` 算法依据 |
| `api-contract.md` | **要写云函数或前端调接口** | 🔴 第 3 周唯一仲裁物。取舍 1–9、2 个接口、`tasks` 表结构。**实现前必读** |
| `cloud-notes.md` | 要查环境 ID / 额度 / 到期日 / 部署命令 | 云端资源笔记（Day 15 产）。含三条免费环境规则与全部排障记录 |

🔴 **`api-contract.md` 是唯一仲裁物** —— 后端照它实现、前端照它调用。
Day 16/17/18/22 实现完对应部分后要把状态改成「已实现」。

## 日志/ — 每日产出与排障

按天编号，`day<N>-<描述>.md`。**这层是记录，不是规范** ——
写代码时别拿日志当依据，被推翻的方案都留在里面（那是有价值的记录，不是错误）。

| 文件 | 内容 |
| --- | --- |
| `day7-week1-validation.md` | 第 1 周周验证（本地保留，不入库） |
| `day8-dsh-handoff.md` | DSH 交接包（本地保留，不入库；**已失效**，见记忆「已失效留档」） |
| `day12-skill-invocation.md` | 项目 Skill 的调用方式 |
| `day13-pages-and-states.md` | 三个视图的页面清单与状态表 |
| `day14-user-test-checklist.md` | 同伴测试用的清单 |
| `day14-user-test-report.md` | 同伴反馈六条与逐条处理 |
| `day14-week2-validation.md` | 第 2 周周验证材料 |
| `day15-cloudfunction-deploy.md` | 🔴 云函数部署排障全套（`--path` 冲突、HTTP 函数类型、`context.httpContext` 真实约定） |
| `day15-frontend-deploy.md` | 🔴 静态托管部署（云端构建失败真相 + 本地构建直传的正确命令） |

⚠️ **Day 17 起先读 `day15-cloudfunction-deploy.md` 与 `day15-frontend-deploy.md`** ——
CloudBase 排障的坑全在里面，不读会重复踩。

## 素材/ — 配图

`data-flow.png` —— 技术设计第五节的数据流图。
源码是 mermaid，用图片是因为 GitHub 渲染那段 mermaid 会报错
（`Could not find a suitable point for the given distance`），
源码仍保留在 `TECH_DESIGN.md` 的折叠块里。

---

## 仓库其他位置

| 位置 | 内容 |
| --- | --- |
| 根 `AGENTS.md` | 🔴 协作规则 —— **每次开工先读** |
| `app/README.md` | 怎么跑起来、目录结构、踩过的坑 |
| `screenshots/` | 每日打卡截图，命名 `day<N>-<描述>.png` |
| `cloudfunctions/` | 云函数代码 |
| `cloudbaserc.json` | CloudBase 配置 |
| 根 `28天VibeCoding学习打卡计划.md` | 课程计划，**本地保留、不入库** |
