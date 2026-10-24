import { useState, type ChangeEvent } from 'react'
import { applyPeoplePatch } from '../../db/people'
import { CONTACT_LABELS, isLive } from '../../domain/people'
import {
  PatchError, defaultDecisions, effectiveSelection, parsePeoplePatch, planPatch, type Decisions, type PatchCounts,
  type PatchOp, type PatchPlan, type PlannedOp,
} from '../../domain/peoplePatch'
import { FIELD_LABELS, opTitle, previewGroups } from '../../domain/peoplePreview'
import { formatDateTime } from '../../domain/ru'
import type { Contact, Meta, PeopleData } from '../../domain/types'
import { errorText } from '../errors'
import type { Nav } from './nav'
import PatchEditSheet from './PatchEditSheet'
import { Avatar, BackBar, icon, primaryClass } from './peopleUi'

const FILE_ICON = 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5'
const PEN_ICON = 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'
const CHECK = 'M5 12.5l4.5 4.5L19 7.5'

const RESULT_LABELS: Record<PatchOp['op'], string> = {
  createPerson: 'Новые люди',
  updatePerson: 'Правки карточек',
  updateNote: 'Правки записей',
  addNote: 'Новые записи',
  upsertDiaryNote: 'Записи из дневника',
  mergePeople: 'Объединения людей',
  linkPeople: 'Знакомства',
  renameSphere: 'Переименованные сферы',
  mergeSpheres: 'Объединения сфер',
}

/** Правка пользователя строкой — как «станет». */
function shown(v: unknown): string {
  if (Array.isArray(v)) {
    return v.every((x) => typeof x === 'string')
      ? v.join(', ')
      : (v as Contact[]).map((c) => `${CONTACT_LABELS[c.type]} ${c.value}`).join(' · ')
  }
  return String(v ?? '')
}

/** Строки «было → станет» операции; правка пользователя заменяет предложение. */
function diffLines(o: PlannedOp, set?: Record<string, unknown>): { label: string; old: string; neu: string }[] {
  const op = o.op
  if (op.op === 'linkPeople') return [{ label: '', old: '', neu: `${o.after.a} и ${o.after.b}` }]
  if (op.op === 'mergePeople') return [{ label: '', old: '', neu: `«${o.before.name}» → «${o.after.name}»` }]
  if (op.op === 'renameSphere' || op.op === 'mergeSpheres') {
    const neu = op.op === 'renameSphere' && typeof set?.newName === 'string' ? set.newName : o.after.name
    return [{ label: '', old: o.before.name, neu }]
  }
  return Object.keys(o.after).map((k) => ({
    label: FIELD_LABELS[k] ?? k,
    old: o.before[k] ?? '',
    neu: set && k in set ? shown(set[k]) : o.after[k],
  }))
}

function OpRow({ o, data, selected, locked, decision, onToggle, onEdit }: {
  o: PlannedOp
  data: PeopleData
  selected: boolean
  locked: boolean
  decision?: Decisions[number]
  onToggle: () => void
  onEdit: () => void
}) {
  const faded = o.status === 'blocked' || (!selected && locked)
  return (
    <div className={`flex items-start gap-3 border-t border-line py-[11px] ${faded ? 'opacity-60' : ''}`}>
      <button
        type="button" role="checkbox" aria-checked={selected} aria-disabled={locked} aria-label={opTitle(o, data)}
        onClick={() => !locked && onToggle()}
        className={`flex size-[26px] shrink-0 items-center justify-center rounded-lg ${
          selected ? 'bg-accent text-accent-ink' : o.status === 'conflict' ? 'border-[1.5px] border-imp-optional bg-imp-optional/10'
            : locked ? 'border-[1.5px] border-dashed border-muted/60' : 'border-[1.5px] border-muted/60 bg-surface'
        }`}
      >
        {selected && icon(CHECK, 15, 3)}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] leading-[1.35] font-semibold">{opTitle(o, data)}</span>
          {decision?.set && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11.5px] font-semibold text-accent">ваша правка</span>}
        </div>
        {diffLines(o, decision?.set).map((d, i) => (
          <div key={i} className="flex flex-col gap-px">
            {d.label && <span className="text-[12px] text-muted">{d.label}</span>}
            {d.old && d.old !== d.neu && <span className="text-[14px] leading-[1.4] break-words text-muted line-through">{d.old}</span>}
            <span className="text-[14px] leading-[1.4] break-words whitespace-pre-line">{d.old && d.old !== d.neu ? `→ ${d.neu}` : d.neu}</span>
          </div>
        ))}
        {o.reason && (
          <span className={`self-start rounded-full px-2.5 py-[3px] text-[12px] leading-[1.35] font-semibold ${o.status === 'conflict' ? 'bg-imp-optional/25' : 'bg-line text-muted'}`}>
            {o.reason}
          </span>
        )}
        {!selected && locked && o.status !== 'blocked' && <span className="text-[12px] text-muted">снята вместе с новым человеком</span>}
      </div>
      {o.editable && o.status !== 'blocked' && (
        <button type="button" aria-label="Править" onClick={onEdit} className="-m-2 flex size-10 shrink-0 items-center justify-center text-muted">
          {icon(PEN_ICON, 18)}
        </button>
      )}
    </div>
  )
}

type Stage =
  | { kind: 'pick'; error?: string; fileName?: string }
  | { kind: 'preview'; plan: PatchPlan; decisions: Decisions; editing: number | null; error?: string }
  | { kind: 'done'; plan: PatchPlan; counts: PatchCounts; byKind: [string, number][] }

function readPatch(json: string, data: PeopleData, meta: Meta, fileName = ''): Stage {
  try {
    const plan = planPatch(parsePeoplePatch(json), data, meta.appliedPatches ?? [])
    return { kind: 'preview', plan, decisions: defaultDecisions(plan), editing: null }
  } catch (e) {
    return { kind: 'pick', fileName, error: e instanceof PatchError ? e.message : `Не удалось прочитать файл: ${errorText(e)}` }
  }
}

/** «Изменения с ПК» (артборд 14): выбор файла, предпросмотр с правкой каждого изменения, итог. */
export default function PatchScreen({ data, meta, json, backLabel, nav }: {
  data: PeopleData
  meta: Meta
  json?: string
  backLabel: string
  nav: Nav
}) {
  const [stage, setStage] = useState<Stage>(() => (json ? readPatch(json, data, meta) : { kind: 'pick' }))
  const [busy, setBusy] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setStage(readPatch(await file.text(), data, meta, file.name))
  }

  const page = 'mx-auto flex max-w-md flex-col gap-3 px-5 pt-[max(28px,env(safe-area-inset-top))]'

  if (stage.kind === 'pick') {
    return (
      <div className={`${page} pb-8`}>
        <BackBar label={backLabel} onBack={nav.back} />
        <h1 className="font-serif text-[30px] leading-[1.15] font-semibold">Изменения с ПК</h1>
        <section className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-4 shadow-card">
          <ol className="flex flex-col gap-3 text-[15px] leading-[1.4]">
            {['Перешлите файл people-patch-….json себе в Telegram «Избранное»', 'В Telegram: файл → «Поделиться» → «Сохранить в Файлы»', 'Здесь — «Выбрать файл»'].map((t, i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <label className={`${primaryClass} cursor-pointer`}>
            {icon(FILE_ICON, 20, 1.9)}Выбрать файл
            <input type="file" accept=".json,application/json" onChange={(e) => void onFile(e)} className="hidden" />
          </label>
        </section>
        {stage.error && (
          <section role="alert" className="flex flex-col gap-2 rounded-[18px] border border-danger/40 bg-danger/10 px-4 py-3.5">
            <span className="text-[16px] font-semibold text-danger">Файл не подошёл</span>
            <p className="text-[14px] leading-[1.45]">{stage.error}</p>
            {stage.fileName && <span className="font-mono text-[12.5px] text-muted">{stage.fileName}</span>}
          </section>
        )}
      </div>
    )
  }

  if (stage.kind === 'done') {
    const { counts, plan } = stage
    return (
      <div className={`${page} min-h-full justify-center gap-4 pb-16`}>
        <span className="flex size-[76px] items-center justify-center self-center rounded-full bg-accent/15 text-accent">{icon(CHECK, 38, 2.2)}</span>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-serif text-[30px] font-semibold">Применено {counts.applied}</h1>
          <span className="text-[13px] text-muted">
            из файла от {formatDateTime(plan.patch.createdAt)}{counts.edited > 0 && ` · ${counts.edited} — с вашей правкой`}
          </span>
        </div>
        {stage.byKind.length > 0 && (
          <section className="flex flex-col rounded-[20px] border border-line bg-surface px-4 py-0.5">
            {stage.byKind.map(([label, n]) => (
              <div key={label} className="flex min-h-[42px] items-center border-b border-line text-[15px] last:border-b-0">
                <span className="flex-1">{label}</span><span className="font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </section>
        )}
        {counts.skipped > 0 && <p className="rounded-[14px] bg-line/70 px-3.5 py-3 text-[14px]">Пропущено {counts.skipped}</p>}
        <button type="button" onClick={nav.back} className={primaryClass}>К людям</button>
      </div>
    )
  }

  const preview = stage
  const { plan, decisions, editing } = preview
  const selection = effectiveSelection(plan, decisions)
  const groups = previewGroups(plan, data)
  const troubled = plan.ops.filter((o) => o.status !== 'ok').length
  const firstTroubled = groups.findIndex((g) => g.ops.some((o) => o.status !== 'ok'))
  const lastApply = (meta.appliedPatches ?? []).find((a) => a.id === plan.patch.id)
  const setDecisions = (d: Decisions) => setStage({ ...preview, decisions: d })
  const editOp = editing === null ? null : plan.ops[editing]

  async function apply() {
    if (busy) return
    setBusy(true)
    try {
      const counts = await applyPeoplePatch(plan, decisions, new Date())
      const byKind = new Map<string, number>()
      plan.ops.forEach((o, i) => {
        if (!selection[i]) return
        const label = o.op.op === 'addNote' && o.op.note.kind === 'diary' ? RESULT_LABELS.upsertDiaryNote : RESULT_LABELS[o.op.op]
        byKind.set(label, (byKind.get(label) ?? 0) + 1)
      })
      setStage({ kind: 'done', plan, counts, byKind: [...byKind] })
    } catch (e) {
      setStage({ ...preview, error: `Не применилось: ${errorText(e)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={page}>
      <div className="-mx-1 -mt-2 flex min-h-[44px] items-center justify-between">
        <button type="button" onClick={() => setStage({ kind: 'pick' })} className="flex min-h-[44px] items-center gap-0.5 text-[16px] text-accent">
          {icon('M15 5l-7 7 7 7', 20, 2.2)}Назад
        </button>
        <span className="text-[16px] font-semibold">Предпросмотр</span>
        <span className="w-[70px]" />
      </div>
      <section className="flex flex-col gap-1.5 rounded-[20px] border border-line bg-surface p-4 shadow-card">
        <span className="font-serif text-[18px] leading-[1.3] font-semibold">{plan.patch.summary || 'Изменения с ПК'}</span>
        <span className="text-[13px] text-muted">
          Создан {formatDateTime(plan.patch.createdAt)} · по выгрузке {formatDateTime(plan.patch.basedOnExportAt)}
        </span>
      </section>
      {plan.alreadyApplied && (
        <p className="rounded-[16px] bg-imp-optional/25 px-3.5 py-3 text-[14px] leading-[1.4]">
          Этот файл уже применён{lastApply ? ` ${formatDateTime(lastApply.appliedAt)}` : ''}. Повторить можно — дублей не будет.
        </p>
      )}
      {groups.map((g, gi) => {
        const person = data.people.find((p) => p.id === g.key && isLive(p))
        const merging = g.ops.some((o) => o.op.op === 'mergePeople')
        return (
          <div key={g.key} className="flex flex-col gap-2">
            {gi === firstTroubled && troubled > 0 && (
              <span className="px-1 pt-1 text-[13px] font-semibold text-danger">Конфликты · {troubled}</span>
            )}
            <section className="flex flex-col rounded-[20px] border border-line bg-surface px-3.5 pt-3 pb-0.5 shadow-card">
              <div className="flex items-center gap-2.5 pb-2.5">
                {g.key === 'spheres'
                  ? <span className="flex size-[30px] items-center justify-center rounded-full bg-line text-[12px] font-semibold">С</span>
                  : <Avatar id={person?.id ?? g.key} name={g.title || '?'} size={30} />}
                <span className="min-w-0 flex-1 font-serif text-[17px] font-semibold">{g.title}</span>
                {(g.isNew || merging) && (
                  <span className="rounded-full bg-accent/15 px-2.5 py-[3px] text-[12px] font-semibold text-accent">{g.isNew ? 'новый' : 'объединение'}</span>
                )}
              </div>
              {g.ops.map((o) => {
                const chosen = o.status !== 'blocked' && (decisions[o.index]?.selected ?? false)
                return (
                  <OpRow
                    key={o.index} o={o} data={data} selected={selection[o.index]} decision={decisions[o.index]}
                    locked={o.status === 'blocked' || (chosen && !selection[o.index])}
                    onToggle={() => setDecisions({ ...decisions, [o.index]: { ...decisions[o.index], selected: !selection[o.index] } })}
                    onEdit={() => setStage({ ...preview, editing: o.index })}
                  />
                )
              })}
            </section>
          </div>
        )
      })}
      {stage.error && <p role="alert" className="text-center text-[14px] text-danger">{stage.error}</p>}
      <div className="sticky bottom-0 -mx-5 mt-1 flex items-center gap-3.5 border-t border-line bg-surface px-5 py-3">
        <span className="text-[14px] whitespace-nowrap text-muted">
          Выбрано <b className="text-ink">{selection.filter(Boolean).length} из {plan.ops.length}</b>
        </span>
        <button type="button" disabled={busy || !selection.some(Boolean)} onClick={() => void apply()} className={`${primaryClass} flex-1`}>
          Применить выбранное
        </button>
      </div>
      {editOp && (
        <PatchEditSheet
          o={editOp} decision={decisions[editOp.index]}
          title={previewGroups({ ...plan, ops: [editOp] }, data)[0]?.title || opTitle(editOp, data)}
          subtitle={opTitle(editOp, data)}
          onClose={() => setStage({ ...preview, editing: null })}
          onSave={(set) => setStage({ ...preview, editing: null, decisions: { ...decisions, [editOp.index]: { selected: true, set } } })}
        />
      )}
    </div>
  )
}
