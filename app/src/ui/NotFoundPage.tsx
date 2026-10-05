// 兜底页：地址打错了（路径 `*`）
//
// 课程要求「3 个视图互相切换不出错」—— 兜底页是这条的**边界情况**：
// 手输一个不存在的地址，不该看到一片空白，也不该看到 React 的默认报错页。
//
// 它是「路由」这件事本身的一部分：有地址，就会有地址打错的时候。

import { Link, useLocation } from 'react-router-dom'

export function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <section className="card">
      <h2>页面不存在</h2>
      <div className="state state-empty">
        <p className="state-title">这个地址没有对应的页面</p>
        <p className="state-sub">
          地址是「{pathname}」。检查一下是不是打错了，或者从下面的入口回去。
        </p>
        <div className="state-actions">
          <Link className="state-action" to="/">
            回今日队列
          </Link>
          <Link className="state-action" to="/tasks">
            看全部任务
          </Link>
        </div>
      </div>
    </section>
  )
}
