# 知先 PriorKnow · 应用

把一堆散乱的任务丢进来，它算出先做哪件，并告诉你为什么。

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

## 技术栈

- **React 19 + TypeScript** —— 界面层
- **Vite 8** —— 开发服务器与打包
- **Dexie 4** —— 封装 IndexedDB，第 1~2 周的本地数据库

第 3 周会把数据层换成云端，**界面层和业务层的代码不用改** —— 这是我们刻意留的接缝。

## 目录结构

```
app/
├── index.html          # 页面入口，React 挂到 <div id="root">
├── vite.config.ts      # Vite 配置
├── tsconfig.json       # TypeScript 配置
└── src/
    ├── main.tsx        # 程序入口
    ├── App.tsx         # 界面外壳：数据流路标 + 加任务 + 今日队列
    ├── styles.css      # 样式（纯 CSS，不引 UI 框架）
    ├── core/           # 业务层：纯 TS，不依赖 React
    │   ├── types.ts            # Task 等核心类型
    │   ├── priority.ts         # 优先级算分（三因子加权）
    │   └── priorityQueue.ts    # 二叉堆优先队列 + 分段排序
    ├── data/           # 数据层
    │   ├── repository.ts       # 接口契约（上层只认它）
    │   ├── local-indexeddb.ts  # IndexedDB 实现（Dexie）
    │   └── index.ts            # 出口：挂上当前实现
    └── ui/             # 界面层
        ├── TaskComposer.tsx    # 加任务表单
        └── TodayQueue.tsx      # 今日队列（自动排序 + 理由）
```

三层之间只有单向依赖：`ui/` → `data/` 接口 + `core/` 算法，**`core/` 不依赖 React**。
这样算法能独立测试，第 3 周换云端实现时上层一行不用改。

## 这个项目当前在哪一步

**第 1 周（Day 1–7）已完成**：四份文档 + 一个能跑的最小版本。

Day 7 分了四步做完：① 骨架跑起来 ② 数据层接口 + IndexedDB ③ 优先级算法 + 优先队列
④ 今日队列闭环。**四步全部完成**，闭环链路是：

```
加任务 → 存进 IndexedDB → 算分 → 排队列 → 显示「为什么是它」
```

第 4 步之前，排序要点一下按钮；现在**数据一变队列就自己重排**，不需要手点。

Day 8 起进入第 2 周（前端补全）。PRD 第三节的 MVP 里还没做的有：
F4 重排动画、F6 今日时间预算、F7 专注模式、F8 导入导出、F9 内置示例数据。

## 踩过的坑

**代码在 WSL 里、用 Windows 侧 Node 跑的时候**，WSL 的网络盘（`\\wsl.localhost\...`）有两个限制：

1. Vite 8 的原生解析器读不了 `\\wsl.localhost\` 这种 UNC 路径，会报
   `Failed to resolve entry for package "vite"`。
   → 先把 WSL 映射成盘符再跑：

   ```powershell
   net use P: \\wsl.localhost\Ubuntu-26.04
   cd P:\home\qbai\Code\PriorKnow\app
   npm run dev
   ```

2. 这类网络盘不支持 Node 的系统级文件变化监听，会报
   `EISDIR: illegal operation on a directory, watch 'vite.config.ts'`。
   → 已在 `vite.config.ts` 里打开轮询监听（`server.watch.usePolling`），无需另外处理。

   ```ts
   server: {
     watch: { usePolling: true, interval: 400 },
   }
   ```

代价是改完代码到页面刷新会慢一点点，对这个项目无所谓。

另外，依赖是用 **Windows 侧 Node** 装的，`node_modules` 里有平台相关的原生二进制，
所以**不要改到 WSL 的 Linux 里跑**，否则会装不上/跑不起来。
