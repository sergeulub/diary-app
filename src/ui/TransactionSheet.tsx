import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { getFinanceCategories, listTransactions, saveTransaction } from '../db/diary'
import { addDays } from '../domain/dates'
import {
  IMPORTANCES, IMPORTANCE_LABELS, SAVINGS_KINDS, SAVINGS_LABELS, categoriesByUse, createTransaction, deleteTransaction,
  isSavings, updateTransaction,
} from '../domain/finance'
import { formatAmount, parseAmount } from '../domain/money'
import { dayGroupTitle } from '../domain/ru'
import type { FinanceKind, SavingsKind, Transaction, TransactionKind } from '../domain/types'
import { errorText } from './errors'
import { ImpDot, SavingsIcon, Segmented, Sheet, now } from './financeUi'

type Tab = FinanceKind | 'savings'

const TABS: { value: Tab; label: string }[] = [
  { value: 'expense', label: 'Трата' },
  { value: 'income', label: 'Доход' },
  { value: 'savings', label: 'Накопления' },
]

const TITLES: Record<TransactionKind, string> = {
  expense: 'Трата', income: 'Доход', save: 'Отложил', withdraw: 'Взял из накоплений',
}

/**
 * Ввод и правка операции: у трат и доходов тап по категории сохраняет и закрывает;
 * у накоплений — выбор «Отложил» / «Взял» и кнопка «Сохранить».
 */
export default function TransactionSheet({ initial, today, onClose }: {
  initial: Transaction | null
  today: string
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(initial && isSavings(initial.kind) ? 'savings' : (initial?.kind as FinanceKind) ?? 'expense')
  const [direction, setDirection] = useState<SavingsKind>(initial && isSavings(initial.kind) ? initial.kind : 'save')
  const kind: TransactionKind = tab === 'savings' ? direction : tab
  const [amount, setAmount] = useState(initial ? formatAmount(initial.amount) : '')
  const [day, setDay] = useState(initial?.day ?? today)
  const [note, setNote] = useState(initial?.note ?? '')
  const [noteOpen, setNoteOpen] = useState(Boolean(initial?.note))
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  const cats = useLiveQuery(getFinanceCategories)
  const recent = useLiveQuery(() => listTransactions(addDays(today, -89), today), [today])
  if (!cats || !recent) return null
  const list = tab === 'savings' ? [] : categoriesByUse(recent, cats, tab, today)

  /** Одна запись за раз: быстрый двойной тап не создаёт вторую операцию. */
  async function write(tx: Transaction, failed: string) {
    if (busy.current) return
    busy.current = true
    try {
      await saveTransaction(tx)
      onClose()
    } catch (e) {
      busy.current = false
      setError(`${failed}: ${errorText(e)}`)
    }
  }

  function save(categoryKey = '') {
    let value: number
    try {
      value = parseAmount(amount)
    } catch (e) {
      setError(errorText(e))
      return
    }
    const tx = initial
      ? updateTransaction(initial, { amount: value, categoryKey, day, note }, now())
      : createTransaction({ kind, amount: value, categoryKey, day, note }, now())
    void write(tx, 'Не сохранилось')
  }

  function remove() {
    if (!initial || !window.confirm('Удалить операцию?')) return
    void write(deleteTransaction(initial, now()), 'Не удалилось')
  }

  const side = 'min-h-[44px] w-24 shrink-0 text-[16px] text-accent'
  return (
    <Sheet>
      <div className="flex items-center justify-between gap-2">
        {initial ? (
          <>
            <button type="button" onClick={onClose} className={`${side} text-left`}>Отмена</button>
            <h2 className="min-w-0 text-center font-serif text-[20px] leading-tight font-semibold">{TITLES[kind]}</h2>
            <button type="button" onClick={() => save(initial.categoryKey)} className={`${side} text-right font-semibold`}>
              Сохранить
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className="min-h-[44px] shrink-0 text-left text-[16px] text-accent">
              Отмена
            </button>
            <Segmented label="Вид операции" options={TABS} value={tab} onChange={setTab} className="flex-1" />
          </>
        )}
      </div>

      {tab === 'savings' && !initial && (
        <div role="group" aria-label="Направление" className="grid grid-cols-2 gap-2">
          {SAVINGS_KINDS.map((k) => (
            <button
              key={k} type="button" aria-pressed={direction === k} onClick={() => setDirection(k)}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold ${
                direction === k ? 'border-2 border-accent bg-accent/15 text-accent' : 'border border-line bg-surface text-ink'
              }`}
            >
              <SavingsIcon kind={k} size={20} />{SAVINGS_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      <label className="flex items-baseline justify-center gap-2 py-1">
        <span className="sr-only">Сумма в рублях</span>
        <input
          autoFocus={!initial} inputMode="decimal" enterKeyHint="done" value={amount} placeholder="0"
          onChange={(e) => {
            setAmount(e.target.value)
            setError(null)
          }}
          style={{ width: `${Math.max(amount.length, 1) + 0.6}ch` }}
          className="bg-transparent text-right font-serif text-[52px] leading-none font-semibold text-ink tabular-nums outline-none placeholder:text-muted"
        />
        <span className="font-serif text-[30px] text-muted">₽</span>
      </label>

      <div className="flex flex-wrap justify-center gap-2">
        <label className="relative flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[14px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          {dayGroupTitle(day, today)}
          <input
            type="date" value={day} max={today} aria-label="День операции"
            onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 text-[16px] opacity-0"
          />
        </label>
        {!noteOpen && (
          <button
            type="button" onClick={() => setNoteOpen(true)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-dashed border-muted/60 px-3.5 text-[14px] text-muted"
          >
            + Комментарий
          </button>
        )}
      </div>
      {noteOpen && (
        <input
          value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} aria-label="Комментарий"
          placeholder="Например, «кофе с Машей»"
          className="min-h-[44px] rounded-[14px] border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-muted"
        />
      )}
      {error && <p role="alert" className="text-center text-[14px] text-danger">{error}</p>}

      {tab === 'savings' ? (
        !initial && (
          <button type="button" onClick={() => save()} className="min-h-[52px] rounded-[14px] bg-accent text-[17px] font-semibold text-accent-ink">
            Сохранить
          </button>
        )
      ) : list.length === 0 ? (
        <p className="text-center text-[15px] text-muted">Нет активных категорий — добавьте их в «Настройках».</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {list.map((c) => {
            const current = initial?.categoryKey === c.key
            return (
              <button
                key={c.key} type="button" aria-pressed={current} onClick={() => save(c.key)}
                className={`flex min-h-[58px] flex-col items-start justify-center gap-1 rounded-[14px] border bg-surface px-2.5 py-2 text-left text-[14px] leading-tight ${
                  current ? 'border-accent ring-2 ring-accent' : 'border-line'
                }`}
              >
                <ImpDot importance={c.importance} />
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      )}
      {kind === 'expense' && (
        <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 text-[12px] text-muted">
          {IMPORTANCES.map((i) => (
            <span key={i} className="flex items-center gap-1.5"><ImpDot importance={i} className="size-2" />{IMPORTANCE_LABELS[i]}</span>
          ))}
        </div>
      )}
      {initial && (
        <button
          type="button" onClick={remove}
          className="mt-2 min-h-[48px] rounded-[14px] border border-danger text-[16px] font-semibold text-danger"
        >
          Удалить операцию
        </button>
      )}
    </Sheet>
  )
}
