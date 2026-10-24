import { useState } from 'react'
import { findByName, foldText } from '../../domain/people'
import type { Sphere } from '../../domain/types'
import { CLOSE_ICON, icon } from './peopleUi'

/**
 * Сферы человека: подсказки из словаря; совпадение без учёта регистра выбирает существующую сферу, а не создаёт
 * новую (артборд 13.2).
 */
export default function SphereInput({ selected, spheres, counts, onAdd, onRemove, onCreate }: {
  selected: string[]
  /** Живые сферы словаря вместе с созданными в этой форме. */
  spheres: Sphere[]
  counts: Map<string, number>
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  onCreate: (name: string) => void
}) {
  const [text, setText] = useState('')
  const q = foldText(text.trim())
  const exact = text.trim() ? findByName(text, spheres) : undefined
  const suggestions = q
    ? spheres.filter((s) => !selected.includes(s.key) && foldText(s.name).includes(q)).slice(0, 5)
    : []

  function choose(name: string) {
    const found = findByName(name, spheres)
    if (found) {
      if (!selected.includes(found.key)) onAdd(found.key)
    } else onCreate(name.trim())
    setText('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((k) => (
          <span key={k} className="flex min-h-[38px] items-center rounded-full border border-line bg-surface pl-3.5 text-[14px]">
            {spheres.find((s) => s.key === k)?.name ?? k}
            <button type="button" aria-label="Убрать" onClick={() => onRemove(k)} className="flex size-9 items-center justify-center text-muted">
              {icon(CLOSE_ICON, 14, 2.4)}
            </button>
          </span>
        ))}
        <input
          value={text} onChange={(e) => setText(e.target.value)} aria-label="Новая сфера" placeholder="+ сфера"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              e.preventDefault()
              choose(text)
            }
          }}
          className="min-h-[38px] w-32 rounded-full border border-dashed border-muted/60 bg-transparent px-3.5 text-[16px] text-ink outline-none placeholder:text-muted focus:border-solid focus:border-accent"
        />
      </div>
      {q && (
        <div role="listbox" aria-label="Подсказки" className="flex flex-col overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_10px_24px_rgba(60,40,20,0.14)]">
          {suggestions.map((s) => (
            <button
              key={s.key} type="button" role="option" aria-selected={exact?.key === s.key} onClick={() => choose(s.name)}
              className={`flex min-h-[46px] items-center gap-2 px-3.5 text-left text-[15px] ${exact?.key === s.key ? 'bg-accent/15' : ''}`}
            >
              <span className="flex-1">{s.name}</span>
              <span className="text-[13px] text-muted">{counts.get(s.key) ?? 0} чел.</span>
            </button>
          ))}
          {!exact && (
            <button
              type="button" onClick={() => choose(text)}
              className="flex min-h-[46px] items-center gap-2 border-t border-line px-3.5 text-left text-[15px] font-semibold text-accent first:border-t-0"
            >
              + Новая сфера «{text.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
