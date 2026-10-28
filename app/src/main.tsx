// 程序入口：把 React 应用挂到 index.html 里的 <div id="root"> 上。
//
// Day 13：外面包一层路由，让「当前在哪个视图」由**地址栏**决定。
// 放在这一层而不是 App 里，是因为它只负责提供「路由上下文」，
// 本身不渲染任何界面 —— 界面外壳（页头 / 导航 / 状态开关 / 页脚）归 App 管。
//
// Day 20：BrowserRouter 换成 HashRouter —— 因为要部署到静态托管。
// 静态托管只认「文件路径」：地址栏是 /tasks 时它会去桶里找 tasks 这个文件，
// 找不到就回 404，React 根本没机会启动。所以刷新 /tasks 会白屏 404。
// 这不是我们代码的 bug，是「单页应用 + 不支持 History 回退的托管」这对组合的通病。
//
// 两条解法：
//   ① 让托管把找不到的路径都回 index.html（需要服务端 rewrite 配置）
//   ② 把视图状态放到 # 后面 —— 浏览器不会把 # 之后的内容发给服务器，
//      于是服务器永远只看到 /，永远回 index.html，刷新怎么刷都不会 404
//
// 本项目用 ②：静态托管没有 rewrite 能力（CLI 里没有任何错误页/重定向配置项），
// ① 走不通。代价是地址栏多一个 #（/#/tasks 而不是 /tasks），换来的是
// 「任何页面刷新、直接分享深链都能打开」。

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import './styles.css'

// 找到挂载点。找不到就直接报错，不要静默失败。
const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点，请检查 index.html')
}

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
