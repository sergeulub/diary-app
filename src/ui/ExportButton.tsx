import { useState } from 'react'
import { deliverExport, prepareExportFile, type ExportResult } from './exportAction'
import { errorText } from './errors'

const DONE_TEXT = { shared: 'Готово — копия отправлена', downloaded: 'Готово — файл скачан' }

export default function ExportButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, setPending] = useState<{ file: File; at: Date } | null>(null)

  function show(r: ExportResult, file: File, at: Date) {
    if (r.kind === 'needs-tap') {
      setPending({ file, at })
      setStatus('Файл готов — нажмите «Отправить файл»')
      return
    }
    setPending(null)
    setStatus(r.kind === 'cancelled' ? 'Отменено' : DONE_TEXT[r.how])
  }
  const fail = (e: unknown) => setStatus(`Ошибка экспорта: ${errorText(e)}`)

  async function onClick() {
    if (pending) {
      // второй тап: файл уже готов, share вызывается синхронно в жесте
      const { file, at } = pending
      deliverExport(file, at).then((r) => show(r, file, at), fail)
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const at = new Date()
      const file = await prepareExportFile(at)
      show(await deliverExport(file, at), file, at)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button" disabled={busy} onClick={onClick}
        className="min-h-[48px] rounded-[14px] bg-accent px-4 text-[17px] font-semibold text-accent-ink active:opacity-80 disabled:opacity-50"
      >
        {pending ? 'Отправить файл' : busy ? 'Готовлю файл…' : label}
      </button>
      {status && <span className="text-[13px] text-muted">{status}</span>}
    </div>
  )
}
