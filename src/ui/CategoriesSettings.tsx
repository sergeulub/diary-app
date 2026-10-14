import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getFinanceCategories, saveFinanceCategories } from '../db/diary'
import {
  IMPORTANCES, IMPORTANCE_LABELS, activeCategories, createCategory, moveCategory, nextImportance, setCategoryArchived,
  sortCategories, updateCategory,
} from '../domain/finance'
import type { FinanceCategory, FinanceKind, Importance } from '../domain/types'
import { errorText } from './errors'
import { ImpDot, Segmented, now } from './financeUi'
import { Card } from './MetricCards'
import { IconButton } from './MetricsSettings'

const KINDS: { value: FinanceKind; label: string }[] = [
  { value: 'expense', label: 'Траты' },
  { value: 'income', label: 'Доходы' },
]
const field = 'min-h-[44px] rounded-[14px] border border-line bg-bg px-3.5 text-[16px] text-ink outline-none'

export default function CategoriesSettings() {
  const all = useLiveQuery(getFinanceCategories)
  const [kind, setKind] = useState<FinanceKind>('expense')
  const [name, setName] = useState('')
  const [importance, setImportance] = useState<Importance>('useful')
  const [error, setError] = useState<string | null>(null)
  if (!all) return null

  const active = activeCategories(all, kind)
  const archived = sortCategories(all).filter((c) => c.kind === kind && c.archived)
  const save = (changed: FinanceCategory[]) => {
    if (!changed.length) return
    saveFinanceCategories(changed).then(() => setError(null), (e) => setError(`Не сохранилось: ${errorText(e)}`))
  }
  const add = () => {
    try {
      save([createCategory({ kind, name, importance }, all, now())])
      setName('')
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <Card title="Категории">
      <Segmented label="Вид категорий" options={KINDS} value={kind} onChange={setKind} />
      {kind === 'expense' && (
        <p className="text-[13px] leading-[1.4] text-muted">
          Тап по важности меняет уровень. Категорию нельзя удалить — только убрать в архив, история остаётся.
        </p>
      )}
      <ul className="flex flex-col">
        {active.map((c, i) => (
          <li key={c.key} className="flex items-center gap-1 border-b border-line py-1 last:border-b-0">
            <input
              key={c.name} defaultValue={c.name} aria-label="Название категории"
              onBlur={(e) => {
                const renamed = updateCategory(c, { name: e.target.value }, now())
                if (renamed) save([renamed])
                else e.target.value = c.name
              }}
              className="min-h-[40px] min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none"
            />
            {c.importance && (
              <button
                type="button" aria-label={`Важность: ${IMPORTANCE_LABELS[c.importance]}. Сменить`}
                onClick={() => {
                  const changed = updateCategory(c, { importance: nextImportance(c.importance!) }, now())
                  if (changed) save([changed])
                }}
                className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 text-[12px] whitespace-nowrap text-ink"
              >
                <ImpDot importance={c.importance} className="size-2" />{IMPORTANCE_LABELS[c.importance]}
              </button>
            )}
            <IconButton label="Выше" disabled={i === 0} onClick={() => save(moveCategory(all, c.key, -1, now()))}>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </IconButton>
            <IconButton label="В архив" onClick={() => save([setCategoryArchived(c, true, all, now())])}>
              <rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" />
            </IconButton>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-[13px] font-semibold text-muted">В архиве — не видны при вводе, суммы в итогах остаются</span>
          {archived.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <span className="text-[16px] text-muted">{c.name}</span>
              <button
                type="button" onClick={() => save([setCategoryArchived(c, false, all, now())])}
                className="min-h-[44px] px-2 text-[15px] font-semibold text-accent"
              >
                Вернуть
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <input
          value={name} onChange={(e) => setName(e.target.value)} className={field}
          placeholder={kind === 'expense' ? 'Новая категория, например «Книги»' : 'Новый источник, например «Кешбэк»'}
        />
        {kind === 'expense' && (
          <select value={importance} onChange={(e) => setImportance(e.target.value as Importance)} aria-label="Важность" className={field}>
            {IMPORTANCES.map((i) => <option key={i} value={i}>{IMPORTANCE_LABELS[i]}</option>)}
          </select>
        )}
        <button
          type="button" disabled={!name.trim()} onClick={add}
          className="min-h-[48px] rounded-[14px] bg-accent text-[17px] font-semibold text-accent-ink disabled:opacity-40"
        >
          Добавить
        </button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </Card>
  )
}
