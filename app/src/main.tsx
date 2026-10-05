// 程序入口：把 React 应用挂到 index.html 里的 <div id="root"> 上。
//
// Day 13：外面包一层 BrowserRouter，让「当前在哪个视图」由**地址栏**决定。
// 放在这一层而不是 App 里，是因为它只负责提供「路由上下文」，
// 本身不渲染任何界面 —— 界面外壳（页头 / 导航 / 状态开关 / 页脚）归 App 管。

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './styles.css'

// 找到挂载点。找不到就直接报错，不要静默失败。
const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点，请检查 index.html')
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
