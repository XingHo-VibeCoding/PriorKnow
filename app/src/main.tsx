// 程序入口：把 React 应用挂到 index.html 里的 <div id="root"> 上。

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// 找到挂载点。找不到就直接报错，不要静默失败。
const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到 #root 挂载点，请检查 index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
