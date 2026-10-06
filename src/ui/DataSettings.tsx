import { useState, type ChangeEvent } from 'react'
import { applyImport, exportSnapshot } from '../db/diary'
import {
  ImportError, describeImport, extractBackupJson, importSize, parseImport, planImport, type ImportPlan,
} from '../domain/importFormat'
import { formatDateTime } from '../domain/ru'
import type { Meta } from '../domain/types'
import { errorText } from './errors'
import ExportButton from './ExportButton'
import { Card } from './MetricCards'

function ImportPanel() {
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // тот же файл можно выбрать повторно
    if (!file) return
    setPlan(null)
    setStatus('Читаю файл…')
    try {
      const backup = parseImport(extractBackupJson(new Uint8Array(await file.arrayBuffer())))
      const next = planImport(await exportSnapshot(), backup)
      setStatus(describeImport(next))
      setPlan(importSize(next) > 0 ? next : null)
    } catch (err) {
      setStatus(err instanceof ImportError ? err.message : `Не удалось прочитать файл: ${errorText(err)}`)
    }
  }

  async function confirm() {
    if (!plan) return
    try {
      await applyImport(plan)
      setStatus('Импорт завершён')
    } catch (err) {
      setStatus(`Импорт не удался: ${errorText(err)}`)
    } finally {
      setPlan(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-[48px] cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-accent px-4 text-[17px] font-semibold text-accent">
        Импорт из файла
        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={onFile} className="hidden" />
      </label>
      {status && <p className="text-[13px] text-muted">{status}</p>}
      {plan && (
        <div className="flex gap-2">
          <button type="button" onClick={confirm}
            className="min-h-[44px] flex-1 rounded-[14px] bg-accent text-[16px] font-semibold text-accent-ink">
            Импортировать
          </button>
          <button type="button" onClick={() => { setPlan(null); setStatus(null) }}
            className="min-h-[44px] flex-1 rounded-[14px] border border-line text-[16px] font-semibold">
            Отмена
          </button>
        </div>
      )}
    </div>
  )
}

export default function DataSettings({ meta }: { meta: Meta }) {
  return (
    <Card title="Данные">
      <p className="text-[15px] text-muted">
        Последний экспорт: {meta.lastExportAt ? formatDateTime(meta.lastExportAt) : 'ещё не было'}
      </p>
      <ExportButton label="Экспорт в zip" />
      <p className="text-[13px] text-muted">
        Архив отправляется в Telegram «Избранное»; на ПК — сохранить из Telegram Desktop. Импорт принимает этот zip или
        backup.json из него; совпадающие дни заменяются более свежей версией.
      </p>
      <ImportPanel />
    </Card>
  )
}
