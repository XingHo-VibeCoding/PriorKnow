# 知先 PriorKnow · 应用

把一堆散乱的任务丢进来，它算出先做哪件，并告诉你为什么。

> 📍 **文档在哪**：规格与日志都在 [`../docs/`](../docs/README.md)，那里有索引。
> 🔴 **要写云端接口先读 [`../docs/规格/api-contract.md`](../docs/规格/api-contract.md)** ——
> 那是第 3 周的唯一仲裁物，本文件只是运行说明。

## 怎么跑起来

### 1. 装依赖（只需一次）

```powershell
cd app
npm install
```

### 2. 启动开发服务器

```powershell
npm run dev
```

看到这样的输出就算成功：

```
VITE v8.3.0  ready in 5787 ms
➜  Local:   http://127.0.0.1:5173/
```

然后在浏览器打开 **http://localhost:5173/**。

### 3. 其他命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（改代码会自动刷新） |
| `npm run typecheck` | 只做 TypeScript 类型检查，不打包 |
| `npm run build` | 类型检查 + 打包到 `dist/` |
| `npm run preview` | 本地预览打包结果 |

⚠️ **端口被占用时会静默顺延到下一个端口** —— 所以 `5173` 不通不代表出错，
看输出里 `Local:` 那一行的实际端口。**要固定端口就加 `--port 5173 --strictPort`**
（`--strictPort` 不能省，否则占用了也不会报错）。

## 技术栈

- **React 19 + TypeScript** —— 界面层
- **Vite 8** —— 开发服务器与打包
- **react-router-dom v7** —— 路由（Day 13 引入）
- **Dexie 4** —— 封装 IndexedDB，第 1~2 周的本地数据库

第 3 周会把数据层换成云端，**界面层和业务层的代码不用改** —— 这是我们刻意留的接缝。
换法就是 `app/src/data/` 里换掉 `index.ts` 挂的那个实现。

## 目录结构

```
app/
├── index.html          # 页面入口，React 挂到 <div id="root">
├── vite.config.ts      # Vite 配置（含 base: './'，静态托管必须）
├── tsconfig.json       # TypeScript 配置
└── src/
    ├── main.tsx        # 程序入口（外层是 BrowserRouter）
    ├── App.tsx         # 界面外壳：Routes + 导航 + 开发开关 + 页脚
    ├── styles.css      # 样式（纯 CSS，不引 UI 框架）
    ├── core/           # 业务层：纯 TS，不依赖 React
    │   ├── types.ts            # Task 等核心类型
    │   ├── priority.ts         # 优先级算分（三因子加权）
    │   └── priorityQueue.ts    # 二叉堆优先队列 + 分段排序
    ├── data/           # 数据层
    │   ├── repository.ts       # 接口契约（上层只认它）
    │   ├── local-indexeddb.ts  # IndexedDB 实现（Dexie）
    │   ├── sampleTasks.ts      # 内置示例数据「期末周冲刺」
    │   └── index.ts            # 出口：挂上当前实现
    └── ui/             # 界面层（Day 13 拆出九个组件）
        ├── AppNav.tsx          # 顶部导航（NavLink 高亮）
        ├── TodayPage.tsx       # /         今日队列
        ├── TasksPage.tsx       # /tasks    全部任务（管理视图）
        ├── TaskDetailPage.tsx  # /tasks/:id 详情与三因子明细
        ├── NotFoundPage.tsx    # 404
        ├── DevStateSwitch.tsx  # 数据层状态开关（开发用）
        ├── ActionToast.tsx     # 提示条（Day 11：失败不整页变错误块）
        ├── useTaskQueue.ts     # 读库 / 算分 / 写操作（三个区块共用）
        ├── format.ts           # 两个文案小工具
        ├── TaskComposer.tsx    # 加任务表单
        ├── TodayBudget.tsx     # 今日预算条
        ├── TodayQueue.tsx      # 今日队列卡片
        └── DataPanel.tsx       # 数据与设置（导出 / 导入 / 示例数据）
```

**三层之间只有单向依赖**：`ui/` → `data/` 接口 + `core/` 算法，**`core/` 不依赖 React**。
这样算法能独立测试，第 3 周换云端实现时上层一行不用改。

## 这个项目当前在哪一步

**Day 15 已完成并提交**（详见 [`../docs/规格/api-contract.md`](../docs/规格/api-contract.md)）：

- **第 1 周（Day 1–7）**：四份文档 + 能跑的最小版本，
  闭环是「加任务 → 存进 IndexedDB → 算分 → 排队列 → 显示为什么是它」。
- **第 2 周（Day 8–14）**：前端补全 —— 风格统一、窄屏适配、
  三个视图 + 路由，以及 Day 14 同伴测试后的最小修复。
- **第 3 周进行中（Day 15 起）**：
  - ✅ Day 15：`/api/health` 云函数已上线公网，前端已部署静态托管，接口契约已产出
  - ⏳ Day 16：数据库建表
  - ⏳ Day 17 起：读接口 / 写接口 / 数据访问层 / 检查台 / 跨域

**线上地址**（Day 15 上线，两个域名别搞混）：

| 是什么 | 地址 |
| --- | --- |
| 前端（静态托管） | `https://priorknow-d0go4uh2uc0f62465-1489177462.tcloudbaseapp.com/` |
| 云函数（health） | `https://priorknow-d0go4uh2uc0f62465.service.tcloudbase.com/api/health` |

⚠️ **公网页面的数据必为空** —— 数据存在各自浏览器的 IndexedDB 里，这是对的。

> 想看「加载中」和「错误」两种状态：在「数据与设置」最下面有个
> **数据层状态（开发用）** 下拉框，切到「模拟慢速读取」或「模拟读取失败」即可。
> 本地数据库读一次只要几毫秒，不主动演一下，这两种状态永远没人见过。
>
> 慢速开关**必须连写入一起放慢** —— 只放慢读的话「处理中…」只有几毫秒，看不出来。

## 踩过的坑

项目在 **Windows 原生路径 `D:\Custom_Programs\MYAPP\PriorKnow`** 上。留档是因为换机器或换目录时可能再遇到：

1. **Vite 8 的原生解析器读不了 UNC 路径**（`\\wsl.localhost\...`），
   会报 `Failed to resolve entry for package "vite"`。
   → 现在直接 `cd D:\Custom_Programs\MYAPP\PriorKnow\app` 即可，不用 `net use` 映射盘符。

2. **网络盘不支持 Node 的文件变化监听**，会报
   `EISDIR: illegal operation on a directory, watch 'vite.config.ts'`。
   当时在 `vite.config.ts` 里打开了轮询监听（`server.watch.usePolling`）。
   → 原生磁盘上**已非必需**，留着只是多一点开销，想删可以删。

3. **依赖是用 Windows 侧 Node 装的**，`node_modules` 里有平台相关的原生二进制
   （`@rolldown/binding-win32-x64-msvc`），**不要在 WSL 的 Linux 里跑** —— 会模块解析失败。
   日后回 WSL 要 `mv` 走再重装。

4. **`vite.config.ts` 里的 `base: './'` 不能删**（Day 15 加的）——
   静态托管的页面在子路径下，不加它资源会 404。

5. **静态托管没有 History 回退** —— 直接刷新 `/tasks` 会 404，
   从首页点导航正常（前端跳转不请求服务器）。已知限制，Day 20 前解决。
