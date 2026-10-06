import { useEffect, useState } from 'react'
import { logicalDay } from '../domain/logicalDay'
import { buildTestZip } from '../domain/testZip'
import { firstVisitAt, recordVisit, writeIsolationMarker } from '../db/probe'
import { requestPersistence } from '../db/storage'
import { shareOrDownload } from './shareFile'

const SHARE_LABELS = { shared: 'Отправлено', downloaded: 'Скачано (окно «Поделиться» недоступно)', cancelled: 'Отменено' }

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="text-[17px]">{value}</span>
    </div>
  )
}

export default function ProbeScreen() {
  const [visits, setVisits] = useState('…')
  const [first, setFirst] = useState('…')
  const [persist, setPersist] = useState('…')
  const [share, setShare] = useState('—')
  const [online, setOnline] = useState(navigator.onLine)
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    const now = new Date().toISOString()
    const fail = (e: unknown) => `ошибка: ${e instanceof Error ? e.message : String(e)}`
    writeIsolationMarker(now, standalone)
    recordVisit(now)
      .then((n) => setVisits(String(n)))
      .catch((e) => setVisits(fail(e)))
    firstVisitAt()
      .then((at) => setFirst(at ? new Date(at).toLocaleString('ru-RU') : 'нет'))
      .catch((e) => setFirst(fail(e)))
    requestPersistence()
      .then((r) => setPersist({ granted: 'да', denied: 'нет', unsupported: 'не поддерживается' }[r]))
      .catch((e) => setPersist(fail(e)))
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [standalone])

  async function onShare() {
    const { fileName, bytes } = buildTestZip(new Date())
    // копия в обычный ArrayBuffer: fflate отдаёт Uint8Array<ArrayBufferLike>, а BlobPart его не принимает
    const file = new File([new Uint8Array(bytes)], fileName, { type: 'application/zip' })
    try {
      setShare(SHARE_LABELS[await shareOrDownload(file)])
    } catch (e) {
      setShare(`Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Фаза 0</p>
        <h1 className="font-serif text-3xl font-semibold">Проверки дневника</h1>
      </div>
      <section className="rounded-[20px] border border-line bg-surface px-4">
        <Row label="Запущено как приложение с экрана «Домой»" value={standalone ? 'да' : 'нет (вкладка Safari)'} />
        <Row label="Сеть" value={online ? 'есть' : 'нет — работаем офлайн'} />
        <Row label="Постоянное хранилище (storage.persist)" value={persist} />
        <Row label="Открытий записано в базу" value={visits} />
        <Row label="Первое открытие" value={first} />
        <Row label="Логический день (граница 06:00)" value={logicalDay(new Date(), 6)} />
        <Row label="Версия сборки" value={new Date(__BUILD_TIME__).toLocaleString('ru-RU')} />
      </section>
      <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4">
        <span className="text-[15px] font-semibold">Экспорт</span>
        <button
          type="button"
          onClick={onShare}
          className="min-h-[48px] rounded-[14px] bg-accent px-4 text-[17px] font-semibold text-accent-ink active:opacity-80"
        >
          Поделиться тестовым zip
        </button>
        <span className="text-[13px] text-muted">Результат: {share}</span>
      </section>
      <p className="text-[13px] text-muted">
        Проверка изоляции: откройте в Safari sergeulub.github.io/diary-app/probe2/, добавьте на экран «Домой» и
        запустите «Пробу 2» с иконки. Ссылки отсюда нет: внутри приложения «Проба 2» открылась бы с тем же хранилищем.
      </p>
    </main>
  )
}
