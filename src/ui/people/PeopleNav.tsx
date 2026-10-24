import { DIARY_ICON, EVENT_ICON, PEOPLE_ICON, PLUS_ICON, icon } from './peopleUi'

const cell = 'flex min-h-[48px] flex-col items-center justify-center gap-1 py-1.5 text-[11px]'
const tone = (on: boolean) => (on ? 'font-semibold text-accent' : 'font-medium text-muted')

/** Нижняя панель модуля: Люди · События · «+» · Дневник (выход). */
export default function PeopleNav({ active, onTab, onAdd, onExit }: {
  active: 'list' | 'events'
  onTab: (tab: 'list' | 'events') => void
  onAdd: () => void
  onExit: () => void
}) {
  return (
    <nav aria-label="Люди" className="relative z-10 grid grid-cols-4 items-center border-t border-line bg-surface px-1.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <button type="button" aria-current={active === 'list' ? 'page' : undefined} onClick={() => onTab('list')} className={`${cell} ${tone(active === 'list')}`}>
        {icon(PEOPLE_ICON)}<span>Люди</span>
      </button>
      <button type="button" aria-current={active === 'events' ? 'page' : undefined} onClick={() => onTab('events')} className={`${cell} ${tone(active === 'events')}`}>
        {icon(EVENT_ICON)}<span>События</span>
      </button>
      <button type="button" aria-label="Добавить человека" onClick={onAdd} className="flex min-h-[48px] items-center justify-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_6px_14px_rgba(30,40,30,0.25)]">
          {icon(PLUS_ICON, 26, 2.3)}
        </span>
      </button>
      <button type="button" onClick={onExit} className={`${cell} ${tone(false)}`}>
        {icon(DIARY_ICON)}<span>Дневник</span>
      </button>
    </nav>
  )
}
