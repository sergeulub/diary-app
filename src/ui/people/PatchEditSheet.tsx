import { useState } from 'react'
import type { Decision, PlannedOp } from '../../domain/peoplePatch'
import { FIELD_LABELS } from '../../domain/peoplePreview'
import { BottomSheet, Field, fieldClass, primaryClass } from './peopleUi'

/** Поля, которые правятся строкой; списки — через запятую. Контакты и архив — только как предложено. */
const LIST_FIELDS = new Set(['aliases', 'spheres'])
const SKIP = new Set(['contacts', 'archived', 'kind'])

/** Предложение файла по полям: то, что операция поставит, если её не править. */
function proposal(o: PlannedOp): Record<string, unknown> {
  const op = o.op
  switch (op.op) {
    case 'createPerson': return op.person
    case 'updatePerson':
    case 'updateNote': return op.set
    case 'addNote': return op.note
    case 'upsertDiaryNote': return { talk: op.talk }
    case 'renameSphere': return { newName: op.newName }
    default: return {}
  }
}

const asText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))
const LABELS: Record<string, string> = { ...FIELD_LABELS, newName: 'Название' }

/** ✎ у изменения (артборд 14.4): что в телефоне, что предлагает Claude, итог — ваш. */
export default function PatchEditSheet({ o, title, subtitle, decision, onSave, onClose }: {
  o: PlannedOp
  title: string
  subtitle: string
  decision?: Decision
  onSave: (set: Record<string, unknown>) => void
  onClose: () => void
}) {
  const proposed = proposal(o)
  const keys = Object.keys(proposed).filter((k) => !SKIP.has(k))
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(keys.map((k) => [k, asText(decision?.set?.[k] ?? proposed[k])])))
  const phone = (k: string) => (o.op.op === 'renameSphere' ? o.before.name : o.before[k])

  function save() {
    const set = Object.fromEntries(keys.map((k) => [
      k, LIST_FIELDS.has(k) ? values[k].split(',').map((s) => s.trim()).filter(Boolean) : values[k],
    ]))
    onSave(set)
  }

  return (
    <BottomSheet label="Правка изменения" onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-[20px] font-semibold">{title}</h2>
        <span className="text-[13px] text-muted">{subtitle}</span>
      </div>
      {o.status === 'conflict' && (
        <p className="rounded-[16px] bg-imp-optional/25 px-3.5 py-3 text-[14px] leading-[1.4]">{o.reason}. Проверьте каждое поле.</p>
      )}
      {keys.map((k) => {
        const mine = phone(k)
        const theirs = asText(proposed[k])
        return (
          <div key={k} className="flex flex-col gap-1 rounded-[18px] border border-line bg-surface px-4 py-3">
            <span className="text-[15px] font-semibold">{LABELS[k] ?? k}</span>
            {mine !== undefined && (
              <div className="flex min-h-[40px] items-center gap-2.5 border-b border-line text-[15px]">
                <span className="w-[86px] shrink-0 text-[12.5px] text-muted">в телефоне</span>
                <span className="min-w-0 flex-1 break-words">{mine || '—'}</span>
                <button type="button" onClick={() => setValues({ ...values, [k]: mine })} className="min-h-[36px] shrink-0 rounded-full border border-line bg-bg px-3 text-[13px] font-semibold text-accent">взять</button>
              </div>
            )}
            <div className="flex min-h-[40px] items-center gap-2.5 border-b border-line text-[15px]">
              <span className="w-[86px] shrink-0 text-[12.5px] text-muted">от Claude</span>
              <span className="min-w-0 flex-1 break-words">{theirs || '—'}</span>
              <button type="button" onClick={() => setValues({ ...values, [k]: theirs })} className="min-h-[36px] shrink-0 rounded-full border border-line bg-bg px-3 text-[13px] font-semibold text-accent">взять</button>
            </div>
            <Field label="Итог">
              {k === 'day' ? (
                <input type="date" value={values[k]} onChange={(e) => e.target.value && setValues({ ...values, [k]: e.target.value })} className={fieldClass} />
              ) : (
                <textarea
                  rows={Math.min(5, Math.max(1, Math.ceil(values[k].length / 34)))} value={values[k]}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                  className="w-full resize-none rounded-[14px] border-[1.5px] border-accent bg-surface px-3.5 py-2.5 text-[16px] leading-[1.4] text-ink outline-none"
                />
              )}
            </Field>
          </div>
        )
      })}
      <button type="button" onClick={save} className={primaryClass}>Готово — применить с правкой</button>
    </BottomSheet>
  )
}
