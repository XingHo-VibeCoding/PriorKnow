// 数据层状态开关 —— 开发用工具。
//
// 这个开关 Day 8 就有了，当时住在「数据与设置」卡片里。
// Day 13 分成三个视图之后把它搬到这里（页面外壳），理由是：
//   要演示「加载中」，原本得先跑到 /tasks 改开关、再切回 / 看效果 ——
//   而切走的那一瞬间 /tasks 自己也在加载中，两边都看不清。
// 它本来就是「让看不见的状态变得看得见」的工具，不是数据管理的一部分，
// 所以提到全局：三个视图都在同一位置能看到、随时能切。
//
// 四种模式各自负责演什么（对应课程要求的「加载 / 成功 / 空 / 错误」四种状态）：
//   normal   —— 正常。配合「库里有没有数据」分别演出「成功」和「空」
//   slow     —— 演「加载中」和「处理中」
//   fail     —— 演「读取失败」（错误态）
//   writeFail—— 演「写入失败」（Day 11 的失败提示条，不是整页错误）

import type { DataMode } from './useTaskQueue'

interface DevStateSwitchProps {
  dataMode: DataMode
  onDataModeChange: (next: DataMode) => void
}

export function DevStateSwitch({ dataMode, onDataModeChange }: DevStateSwitchProps) {
  return (
    <div className="dev-bar">
      <label className="dev-row" htmlFor="data-mode">
        <span className="dev-label">数据层状态（开发用）</span>
        <select
          id="data-mode"
          className="dev-select"
          value={dataMode}
          onChange={(event) => onDataModeChange(event.target.value as DataMode)}
        >
          <option value="normal">正常</option>
          <option value="slow">模拟慢速 —— 看「加载中」和「处理中」</option>
          <option value="fail">模拟读取失败 —— 看「错误」</option>
          <option value="writeFail">模拟写入失败 —— 看失败提示条</option>
        </select>
      </label>
      <p className="dev-note">
        本地数据库读一次只要几毫秒、也几乎不会写失败，这些状态平时根本看不见。
        这个开关把它们主动演出来，好确认它们真的存在、也真的能用。
        「慢速」连写入一起放慢 —— 否则「处理中…」只闪几毫秒，写了等于没做。
      </p>
    </div>
  )
}
