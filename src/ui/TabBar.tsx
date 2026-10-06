import type { ReactNode } from 'react'

export type Tab = 'summary' | 'calendar' | 'settings'

const icon = (children: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'summary', label: 'Итог', icon: icon(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>) },
  { id: 'calendar', label: 'Календарь', icon: icon(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>) },
  { id: 'settings', label: 'Настройки', icon: icon(<><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>) },
]

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="grid grid-cols-3 border-t border-line bg-surface px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {TABS.map((t) => (
        <button
          key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}
          className={`flex min-h-[48px] flex-col items-center gap-1 py-1.5 text-[11px] ${
            tab === t.id ? 'font-semibold text-accent' : 'font-medium text-muted'
          }`}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
