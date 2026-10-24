import type { ReactNode } from 'react'
import { initials } from '../../domain/people'

const TINTS = ['bg-accent/15', 'bg-imp-optional/25', 'bg-imp-useful/30', 'bg-line']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Кружок с инициалами; оттенок постоянный для человека. */
export function Avatar({ id, name, size = 42 }: { id: string; name: string; size?: number }) {
  return (
    <span
      aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-ink ${TINTS[hash(id) % TINTS.length]}`}
    >
      {initials(name)}
    </span>
  )
}

export const icon = (d: string, size = 24, strokeWidth = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

export const PEOPLE_ICON = 'M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1 0.8 3.5 2.8 3.5 5.7'
export const EVENT_ICON = 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4M12 12.5l1.2 2.3 2.5 0.4-1.8 1.7 0.4 2.5-2.3-1.2-2.3 1.2 0.4-2.5-1.8-1.7 2.5-0.4z'
export const DIARY_ICON = 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h4'
export const CALENDAR_ICON = 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4'
export const CLOSE_ICON = 'M6 6l12 12M18 6L6 18'
export const PLUS_ICON = 'M12 5v14M5 12h14'

/** «‹ Люди» слева и необязательная кнопка справа. */
export function BackBar({ label, onBack, right }: { label: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="-mx-1 -mt-2 flex min-h-[44px] items-center justify-between">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-0.5 text-[16px] text-accent">
        {icon('M15 5l-7 7 7 7', 20, 2.2)}{label}
      </button>
      {right}
    </div>
  )
}

export const textButton = 'min-h-[44px] px-1 text-[16px] font-semibold text-accent'

/** Шторка снизу поверх экрана; тап по затемнению закрывает. */
export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <section
        aria-label={label}
        className="relative mx-auto flex max-h-[88dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-bg px-5 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(40,30,20,0.15)]"
      >
        <span aria-hidden="true" className="h-[5px] w-10 shrink-0 self-center rounded-full bg-line" />
        {children}
      </section>
    </div>
  )
}

/** Пометка в строке: глиняная — «не разобрано», серая — «не дополнено». */
export function Mark({ tone, children }: { tone: 'clay' | 'grey'; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2.5 py-[3px] text-[12px] font-semibold whitespace-nowrap ${
      tone === 'clay' ? 'bg-imp-optional/25 text-ink' : 'bg-line text-muted'
    }`}>
      {children}
    </span>
  )
}

export const fieldClass =
  'min-h-[46px] w-full rounded-[14px] border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-muted'
export const areaClass =
  'w-full resize-none rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[16px] leading-[1.45] text-ink outline-none placeholder:text-muted'
export const primaryClass =
  'flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-accent px-4 text-[17px] font-semibold text-accent-ink disabled:opacity-50'
export const secondaryClass =
  'flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] border border-line bg-surface px-4 text-[16px] font-semibold text-ink'
export const dangerClass =
  'min-h-[48px] rounded-[14px] border border-danger text-[16px] font-semibold text-danger'
export const chipClass =
  'flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[14px] text-ink'
export const dashedChipClass =
  'flex min-h-[38px] items-center gap-1.5 rounded-full border border-dashed border-muted/60 px-3.5 text-[14px] text-muted'

/** Подпись поля над вводом. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </label>
  )
}
