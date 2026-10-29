// 时间选择器 —— 用「数字时钟 + 滚轮」代替原生 datetime-local 的时间下拉
//
// 动机（用户原话）：日期还行，时间下拉「生硬」。原生时间控件长什么样由浏览器决定，
// 而且是一格一格跳的列表；这里改成两个可以滚的滚轮：
//   · 中间那格被一个框圈住（就是你要选的值），上下边缘的选项渐隐
//   · 两列中间一个冒号，整体读起来像一个数字时钟
//   · 滚动带吸附（scroll-snap），松手一定停在整格上，不会停在两格之间
//   · 键盘能操作（↑↓ ±1，Shift+↑↓ ±5，Home/End 到两端）
//
// 🔴 为什么不自己实现「拖拽滚动」：
//    浏览器原生的 overflow 滚动已经带惯性、触摸板、滚动条、无障碍支持；
//    自己写一套 pointermove 逻辑，等于把这些免费拿到的东西全部重做一遍，还更容易坏。
//    这里只做两件事：把滚动位置吸附到整格、把外面的值写回滚轮位置。
//
// ⚠️ 本文件不碰数据层，只受控地吐出一个 'HH:MM' 字符串。

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

/** 每格高度（px）。🔴 必须与 styles.css 里 `.wheel-item` 的 height 一致，否则滚动位置会错半格 */
const ITEM_H = 36

/** 默认截止时刻 —— 用户定的是 22:30（不是 23:59，也不是 18:00） */
export const DEFAULT_DUE_TIME = '22:30'

const pad = (n: number) => String(n).padStart(2, '0')

interface TimePickerProps {
  /** 'HH:MM' */
  value: string
  onChange: (next: string) => void
  /** 没选日期时时间不生效，这里置灰 —— 免得让人以为「我设了 9 点却不生效」 */
  disabled?: boolean
}

export function TimePicker({ value, onChange, disabled = false }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const [hh, mm] = value.split(':').map((part) => Number(part))
  const hours = Number.isFinite(hh) ? hh : 22
  const minutes = Number.isFinite(mm) ? mm : 30

  function close() {
    setOpen(false)
    // 收起后把焦点还给触发按钮 —— 否则焦点会掉到 body 上，键盘用户会「迷路」
    triggerRef.current?.focus()
  }

  return (
    <div className="time-picker">
      <button
        ref={triggerRef}
        type="button"
        className={open ? 'time-trigger open' : 'time-trigger'}
        onClick={() => (open ? close() : setOpen(true))}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`截止时刻 ${pad(hours)}:${pad(minutes)}`}
        title={disabled ? '先选上面的日期' : '点开选择时刻'}
      >
        {/* 触发按钮本身就是一个小数字时钟：两位数字各带一个框，中间一个冒号 */}
        <span className="time-digit">{pad(hours)}</span>
        <span className="time-colon" aria-hidden="true">:</span>
        <span className="time-digit">{pad(minutes)}</span>
      </button>

      {open && (
        <div
          className="time-pop"
          role="dialog"
          aria-label="选择截止时刻"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close()
            }
          }}
        >
          <div className="clock">
            <WheelColumn
              label="时"
              max={23}
              value={hours}
              autoFocus
              onChange={(next) => onChange(`${pad(next)}:${pad(minutes)}`)}
            />
            <span className="clock-colon" aria-hidden="true">:</span>
            <WheelColumn
              label="分"
              max={59}
              value={minutes}
              onChange={(next) => onChange(`${pad(hours)}:${pad(next)}`)}
            />
          </div>

          <div className="time-pop-foot">
            <span className="time-pop-note">
              {pad(hours)}:{pad(minutes)} 截止
            </span>
            <button type="button" className="time-pop-done" onClick={close}>
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- 单列滚轮 ----------

interface WheelColumnProps {
  /** 「时」或「分」，同时用作无障碍标签 */
  label: string
  max: number
  value: number
  onChange: (next: number) => void
  autoFocus?: boolean
}

function WheelColumn({ label, max, value, onChange, autoFocus = false }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  /**
   * 这一次值的变化是不是「用户自己滚出来的」。
   * 用来避免下面的同步 effect 把用户正在滚的列表拽回整数格（那会让滚动一卡一卡的）。
   */
  const fromScroll = useRef(false)

  // 外部改值（键盘、父组件重置）时，把滚动位置追过去
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    const target = value * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  function handleScroll() {
    const el = ref.current
    if (!el) return
    const next = Math.min(max, Math.max(0, Math.round(el.scrollTop / ITEM_H)))
    if (next === value) return
    fromScroll.current = true
    onChange(next)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1
    let next = value
    switch (event.key) {
      case 'ArrowUp':
        next = value + step
        break
      case 'ArrowDown':
        next = value - step
        break
      case 'PageUp':
        next = value + 5
        break
      case 'PageDown':
        next = value - 5
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = max
        break
      default:
        return
    }
    // 不 preventDefault 的话，↑↓ 会同时滚动整个弹层所在页面
    event.preventDefault()
    onChange(Math.min(max, Math.max(0, next)))
  }

  return (
    <div className="wheel-box">
      <div
        ref={ref}
        className="wheel"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${label}`}
        onKeyDown={handleKey}
        onScroll={handleScroll}
      >
        {/* 上下各留两格，第一项和最后一项才能滚到正中间 */}
        <div className="wheel-spacer" aria-hidden="true" />

        {Array.from({ length: max + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            // ⚠️ 不进 Tab 序列：60 个数字逐个 Tab 过去是灾难。
            //    键盘用户用列上的 ↑↓ / Home / End，鼠标用户直接点。
            tabIndex={-1}
            className={i === value ? 'wheel-item on' : 'wheel-item'}
            onClick={() => onChange(i)}
          >
            {pad(i)}
          </button>
        ))}

        <div className="wheel-spacer" aria-hidden="true" />
      </div>

      {/* 选中框是**不随滚动移动**的一层，所以它必须放在滚动容器外面 */}
      <div className="wheel-frame" aria-hidden="true" />
    </div>
  )
}
