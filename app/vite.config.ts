// Vite 配置文件
// 作用：告诉 Vite「用什么插件」「开发服务器怎么起」。
// 这里只有两件事：装上 React 插件、固定开发端口。

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // React 插件负责把 JSX 编译成浏览器能跑的代码
  plugins: [react()],

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
