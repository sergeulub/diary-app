import type { ReactNode } from 'react'
import { addMonths, isoWithOffset } from '../domain/dates'
import { monthTitle } from '../domain/ru'
import type { Importance } from '../domain/types'

export const now = () => isoWithOffset(new Date())

export const IMP_BG: Record<Importance, string> = {
  need: 'bg-imp-need',
  useful: 'bg-imp-useful',
  optional: 'bg-imp-optional',
}

/** Точка важности категории; у дохода важности нет — точка акцентная. */
export function ImpDot({ importance, className = 'size-2.5' }: { importance?: Importance; className?: string }) {
  return <span aria-hidden="true" className={`shrink-0 rounded-full ${importance ? IMP_BG[importance] : 'bg-accent'} ${className}`} />
}

const Chevron = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

/** Шапка вкладки: надпись, «Ноябрь 2026», стрелки месяца. max — последний доступный месяц. */
export function MonthHeader({ overline, month, onChange, max }: {
  overline: string
  month: string
  onChange: (month: string) => void
  max?: string
}) {
  const [y, m] = month.split('-').map(Number)
  const btn = 'flex size-11 items-center justify-center rounded-[14px] border border-line bg-surface text-ink disabled:opacity-30'
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{overline}</p>
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">{monthTitle(y, m - 1)}</h1>
      </div>
      <div className="flex gap-2">
        <button type="button" aria-label="Прошлый месяц" className={btn} onClick={() => onChange(addMonths(month, -1))}>
          <Chevron d="M15 5l-7 7 7 7" />
        </button>
        <button
          type="button" aria-label="Следующий месяц" className={btn}
          disabled={max !== undefined && month >= max} onClick={() => onChange(addMonths(month, 1))}
        >
          <Chevron d="M9 5l7 7-7 7" />
        </button>
      </div>
    </header>
  )
}

/** Полноэкранный лист поверх вкладки — как правка дня в календаре. */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3.5 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ label, options, value, onChange, className = '' }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group" aria-label={label} className={`grid rounded-xl bg-line/70 p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-[36px] rounded-[10px] px-2 text-[14px] ${
            o.value === value ? 'bg-surface font-semibold text-ink shadow-sm' : 'font-medium text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * iOS открывает клавиатуру, только если поле получило фокус внутри жеста. Лист рисуется после тапа, поэтому в самом
 * обработчике фокусируем временное поле: клавиатура открывается, поле суммы в листе забирает фокус себе.
 */
export function primeKeyboard() {
  const el = document.createElement('input')
  el.setAttribute('inputmode', 'decimal')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px'
  document.body.appendChild(el)
  // убираем, когда фокус ушёл в поле суммы; таймер — если лист так и не открылся
  el.addEventListener('blur', () => el.remove(), { once: true })
  el.focus()
  window.setTimeout(() => el.remove(), 5000)
}
