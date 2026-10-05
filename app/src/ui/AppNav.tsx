// 顶部导航 —— Day 13 新增。
//
// 三个视图之间的切换入口。用 NavLink 而不是普通 Link，是因为它自带 isActive：
// 当前所在的视图自动高亮，用户不用回头看地址栏就知道自己在哪一屏。
//
// ⚠️ 「今日队列」必须加 `end`。不加的话，`/` 会匹配**所有**以斜杠开头的地址 ——
//    人在 /tasks 时「今日队列」也会被判成当前页，两个标签同时亮，等于没高亮。
//
// 「全部任务」故意**不加** end：详情页 /tasks/123 在语义上属于「全部任务」这一区，
// 在详情页时这个标签保持高亮是对的。

import { NavLink } from 'react-router-dom'

/** 当前页的标签加一个 is-active，样式在 styles.css 的 .app-nav 一节 */
function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link is-active' : 'nav-link'
}

export function AppNav() {
  return (
    <nav className="app-nav" aria-label="主导航">
      <NavLink to="/" end className={navClass}>
        今日队列
      </NavLink>
      <NavLink to="/tasks" className={navClass}>
        全部任务
      </NavLink>
    </nav>
  )
}
