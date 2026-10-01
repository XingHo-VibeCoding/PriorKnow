# Day 12｜frontend-guidelines Skill 调用记录

> 这份文件是 Day 12 完成标准②「Skill 至少真实调用一次并留有调用记录」的证据。
> 记的是**真实发生过的一次调用**：怎么调的、传了什么、工具回了什么，
> 以及这些规则**实际改了哪几行代码** —— 不是「我调了一下，挺好的」。

## 1. Skill 放在哪

| # | 位置 | 路径 | 是否入库 | SHA-256（前 16 位） |
|---|---|---|---|---|
| ① | 项目根 | `skills/frontend-guidelines/SKILL.md` | ✅ 入库（GitHub 可见、可截图） | `946dc53abf6703d7` |
| ② | 项目级 | `.workbuddy/skills/frontend-guidelines/SKILL.md` | ❌ 被 `.gitignore` 第 45 行忽略 | `946dc53abf6703d7` |
| ③ | 用户级 | `C:\Users\B3004\.workbuddy\skills\frontend-guidelines\SKILL.md` | ❌ 在项目目录之外 | `946dc53abf6703d7` |

三份**逐字节一致**（`cmp` 通过、SHA-256 全等）。改任何一份都要同步另外两份，
校验方式就是比 SHA-256。

**为什么放了三份**：附录 G 规定的两处（项目级 / 用户级）在本机实测**都调不起来** ——
本机的技能索引只扫用户级目录，项目级目录根本不在监视列表里（证据见第 2 节）。
于是：用户级那份负责「能被加载」，项目根那份负责「能被提交、能被截图」。

## 2. 「被系统收录」的硬证据

索引缓存文件 `C:\Users\B3004\.workbuddy\.skill-list-cache.json`：

| 时刻 | `results` 条数 | 是否含 frontend-guidelines |
|---|---|---|
| 放用户级副本**之前** | 50 | ❌ 不含 |
| 放用户级副本**之后**（缓存于 `13:45:03` 自动重建） | **51** | ✅ 含 |

收录条目的关键字段：

```
name                    : frontend-guidelines
filePath                : C:\Users\B3004\.workbuddy\skills\frontend-guidelines\SKILL.md
source                  : userSettings
disable                 : false
disableModelInvocation  : false
```

`watch.dirs`（索引监视的目录列表）：

```
含 frontend 的 : ['C:\\Users\\B3004\\.workbuddy\\skills\\frontend-guidelines']
含 PriorKnow 的: []          ← 项目里的 skills/ 与 .workbuddy/skills/ 都没被扫
```

**这就是「项目级目录不被扫」的直接原因** —— 不是配置写错，是它压根不在扫描范围里。

## 3. 调用记录

| 项 | 值 |
|---|---|
| 时间 | 2026-10-01 13:47 前后（本机时间） |
| 方式 | Skill 工具，`skill = "frontend-guidelines"` |
| 传参 | 「检查今日队列页面（TodayQueue）的卡片与按钮样式，以及 375px 窄屏下是否存在横向滚动」 |
| 工具返回 | 加载成功，`Base directory for this skill: C:\Users\B3004\.workbuddy\skills\frontend-guidelines` |
| 返回内容 | SKILL.md 六节正文原样返回：页面层级 / 颜色与字体 / 卡片与按钮 / 移动端 / 修改前 / 修改后 |

**返回的 base directory 指向用户级那份** —— 与第 2 节的索引证据互相印证：
真正被加载的是③，不是①。

## 4. 这次调用用到了哪几条

Day 12 主任务「筛选交互」直接照着 Skill 的这几条做，逐条对得上：

| Skill 里的条款 | 落到哪 |
|---|---|
| 「正文 14px；标签 / 元信息 13px 为下限；11px、12px 全部消灭」 | 筛选条所有控件 13px（`getComputedStyle` 实测 `13px`） |
| 「非文字 UI 元素（图标、边框、焦点环）≥ 3:1」 | 输入框 / 下拉描边原用 `--line`，只有 **1.31:1** → 改用 `#8b8170`（**3.84:1**）；「清除筛选」描边原 `#edc8bf` **1.32:1** → 改用 `--accent`（**4.14:1**） |
| 「算对比度要用叠加后的有效色，必须用脚本算，不能目测」 | 用 Python 按 WCAG 相对亮度公式算，逐项列表 |
| 「修改前先列具体问题，再逐个修复，一次只改一个」 | 先跑 CDP 拿实测 → 发现描边不达标 → 才改，改完重跑 |
| 「全部用实测值（`getComputedStyle`），不要读 CSS 源码」 | 结论全部取自 CDP 里 `getComputedStyle` 的实际值 |
| 「360px 与 375px 下不能出现横向滚动：断言 `scrollWidth === clientWidth`」 | 375px 实测 `375 === 375` |
| 「修改后：桌面宽度和手机宽度各看一遍」 | 1280 与 375 各跑一遍 |
| 「交互没有因为改样式而失效（都要真点一遍）」 | CDP 真点三种情况：有结果 / 无结果 / 清空恢复 |
| 「`npm run build` 必须通过」 | `tsc --noEmit && vite build` 通过 |

## 5. 结论

- Skill 已能被工具加载并返回内容（第 2、3 节）。
- 这次调用**不是走个过场** —— 它的规则实际改了代码：
  描边对比度从 1.31:1 / 1.32:1 修到 3.84:1 / 4.14:1，改完又跑了一遍验证。
- 一句话总结这个 Skill 检查什么：**它检查的是「页面看起来对不对」——
  字号有没有小到看不清、文字和边界的颜色对比够不够、窄屏会不会横向溢出、
  以及改样式之前有没有先量、改完有没有两种宽度各验一遍。**
