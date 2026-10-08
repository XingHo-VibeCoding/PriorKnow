// Vite 配置文件
// 作用：告诉 Vite「用什么插件」「资源怎么引用」「开发服务器怎么起」。

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // React 插件负责把 JSX 编译成浏览器能跑的代码
  plugins: [react()],

  // base: './' —— Day 15 加的，**部署到 CloudBase 静态托管必须设**。
  //
  // 背景：Day 13 引入了 react-router-dom，页面地址变成 `/`、`/tasks`、`/tasks/:id`。
  // 前端路由有个特点：**刷新或直接访问 `/tasks` 时，浏览器会真的去请求
  // 域名根目录下的 `/tasks` 这个文件**，而不是交给前端路由处理。
  //
  // 不设 base 时 Vite 默认生成绝对路径引用（实测）：
  //     <script src="/assets/index-xxx.js">
  // 设了base: './' 之后变成相对路径（实测）：
  //     <script src="./assets/index-xxx.js">
  // 差别在于：挂到**子路径**（如 `/priorknow`）时，绝对路径会去根目录找
  // `/assets/`，而文件其实在 `/priorknow/assets/` → **整页白屏**。
  //
  // ⚠️ 官方文档明确要求子路径部署设这个：
  //   「在项目配置中将公共路径设置为**相对路径** `./`，避免静态资源加载失败」
  //   —— https://docs.cloudbase.net/hosting/web-hosting-guide
  //
  // 设为 './' 对本地开发**没有副作用**（开发时资源仍走 `/`）。
  base: './',

  server: {
    // 固定端口，方便截图和记录运行命令
    port: 5173,
    // 不自动打开浏览器（我们自己开）
    open: false,

    // 代码放在 WSL 里、用 Windows 侧 Node 跑的时候，
    // 这类网络盘不支持系统级的文件变化通知，Vite 会在启动时直接报 EISDIR。
    // 改成「定时轮询」就能正常跑，代价是改完代码到页面刷新会慢一点点。
    watch: {
      usePolling: true,
      interval: 400,
    },
  },
})
