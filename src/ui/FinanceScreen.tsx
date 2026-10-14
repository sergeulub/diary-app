import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, listTransactions } from '../db/diary'
import { monthOf, monthRange } from '../domain/dates'
import {
  IMPORTANCES, IMPORTANCE_LABELS, categoryOf, groupByDay, importanceShares, monthSummary,
} from '../domain/finance'
import { formatMoney } from '../domain/money'
import { dayGroupTitle, plural } from '../domain/ru'
import type { Meta, Transaction } from '../domain/types'
import { IMP_BG, ImpDot, MonthHeader, primeKeyboard } from './financeUi'
import { Card } from './MetricCards'
import TransactionSheet from './TransactionSheet'
import { useLogicalToday } from './useLogicalToday'

const TOP = 5
const box = 'flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-card'

export default function FinanceScreen({ meta }: { meta: Meta }) {
  const today = useLogicalToday(meta.boundaryHour)
  const [month, setMonth] = useState(() => monthOf(today))
  const [sheet, setSheet] = useState<Transaction | 'new' | null>(null)
  const [allCats, setAllCats] = useState(false)
  const [from, to] = monthRange(month)
  const txs = useLiveQuery(() => listTransactions(from, to), [from, to])
  const cats = useLiveQuery(getFinanceCategories)
  if (!txs || !cats) return null

  const s = monthSummary(txs, cats, month)
  const shares = importanceShares(s.byImportance)
  const groups = groupByDay(txs, month)
  const maxCat = s.expenseByCategory[0]?.amount ?? 0
  const hidden = s.expenseByCategory.length - TOP
  const shownCats = allCats ? s.expenseByCategory : s.expenseByCategory.slice(0, TOP)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-28">
      <MonthHeader overline="Финансы" month={month} onChange={setMonth} max={monthOf(today)} />

      <section className={box}>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Доход', formatMoney(s.income), ''],
            ['Траты', formatMoney(s.expense), ''],
            ['Отложено', formatMoney(s.saved), s.saved < 0 ? 'text-danger' : 'text-accent'],
          ].map(([label, value, tone]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted">{label}</span>
              <span className={`text-[18px] font-semibold tabular-nums ${tone}`}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      {s.expense > 0 && (
        <Card title="Траты по важности">
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-md">
            {IMPORTANCES.filter((i) => s.byImportance[i] > 0).map((i) => (
              <div key={i} className={IMP_BG[i]} style={{ flex: s.byImportance[i] }} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {IMPORTANCES.map((i) => (
              <div key={i} className="flex items-center gap-2.5 text-[15px]">
                <ImpDot importance={i} />
                <span className="flex-1">{IMPORTANCE_LABELS[i]}</span>
                <span className="text-[13px] text-muted">{shares[i]} %</span>
                <span className="w-24 text-right font-semibold tabular-nums">{formatMoney(s.byImportance[i])}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {s.expenseByCategory.length > 0 && (
        <Card title="По категориям">
          {shownCats.map((c) => (
            <div key={c.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[15px]">
                <ImpDot importance={c.importance} />
                <span className="flex-1">{c.name}</span>
                <span className="font-semibold tabular-nums">{formatMoney(c.amount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-line">
                <div
                  className={`h-1.5 rounded-full ${c.importance ? IMP_BG[c.importance] : 'bg-accent'}`}
                  style={{ width: `${maxCat ? Math.round((c.amount / maxCat) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setAllCats((v) => !v)} className="min-h-[44px] self-start text-[14px] font-semibold text-accent">
              {allCats ? 'Свернуть' : `Ещё ${hidden} ${plural(hidden, ['категория', 'категории', 'категорий'])}`}
            </button>
          )}
        </Card>
      )}

      {s.incomeByCategory.length > 0 && (
        <Card title="Доходы">
          {s.incomeByCategory.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-[15px]">
              <ImpDot />
              <span className="flex-1">{c.name}</span>
              <span className="font-semibold tabular-nums">{formatMoney(c.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      {groups.length === 0 && (
        <p className="rounded-[20px] border border-dashed border-line p-5 text-center text-[15px] text-muted">
          В этом месяце операций нет. Нажмите «+», чтобы добавить первую.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.day} className="flex flex-col gap-2">
          <div className="flex justify-between px-1 text-[13px] font-semibold text-muted">
            <span>{dayGroupTitle(g.day, today)}</span>
            <span>{g.expense > 0 ? formatMoney(g.expense) : ''}</span>
          </div>
          <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-1">
            {g.items.map((t) => {
              const c = categoryOf(t, cats)
              return (
                <button
                  key={t.id} type="button" onClick={() => setSheet(t)}
                  className="flex min-h-[56px] items-center gap-3 border-b border-line py-2 text-left text-[15px] last:border-b-0"
                >
                  <ImpDot importance={c.importance} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>{c.name}</span>
                    {t.note && <span className="truncate text-[13px] text-muted">{t.note}</span>}
                  </span>
                  <span className={`font-semibold tabular-nums ${t.kind === 'income' ? 'text-accent' : ''}`}>
                    {t.kind === 'income' ? '+' : ''}{formatMoney(t.amount)}
                  </span>
                </button>
              )
            })}
          </section>
        </div>
      ))}

      <button
        type="button" aria-label="Добавить операцию"
        onClick={() => {
          primeKeyboard()
          setSheet('new')
        }}
        className="fixed right-5 bottom-[calc(max(8px,env(safe-area-inset-bottom))+84px)] z-10 flex size-[60px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_20px_rgba(40,50,20,0.28)]"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {sheet && (
        <TransactionSheet initial={sheet === 'new' ? null : sheet} today={today} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}
