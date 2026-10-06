import { setMeta } from '../db/diary'
import { pad } from '../domain/dates'
import type { Meta } from '../domain/types'
import DataSettings from './DataSettings'
import { Card } from './MetricCards'
import MetricsSettings from './MetricsSettings'

const HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export default function SettingsScreen({ meta }: { meta: Meta }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3.5 px-5 pt-[max(28px,env(safe-area-inset-top))] pb-6">
      <h1 className="font-serif text-[30px] font-semibold">Настройки</h1>
      <MetricsSettings />
      <Card title="Граница дня">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-muted">Записи до этого часа относятся к прошлому дню</span>
          <select
            value={meta.boundaryHour} aria-label="Граница дня"
            onChange={(e) => void setMeta('boundaryHour', Number(e.target.value))}
            className="min-h-[44px] rounded-[14px] border border-line bg-bg px-3 text-[17px] text-ink"
          >
            {HOURS.map((h) => <option key={h} value={h}>{pad(h)}:00</option>)}
          </select>
        </label>
      </Card>
      <DataSettings meta={meta} />
      <Card title="Напоминание">
        <div className="flex flex-col gap-2 text-[15px] leading-[1.5] text-muted">
          <p>
            <b className="text-ink">Будильник</b> — звучит, пока не выключишь: «Часы» → «Будильник» → «+» → 23:00,
            «Повтор» — каждый день, «Метка» — «Запиши день», мелодия на выбор.
          </p>
          <p>
            <b className="text-ink">Уведомление</b> — дополнительно: «Напоминания» → новое «Запиши день» → дата и время
            23:00 → «Повтор» — ежедневно.
          </p>
          <p>Ни то ни другое не открывает дневник — открой его с иконки на экране «Домой».</p>
        </div>
      </Card>
      <p className="text-center text-[13px] text-muted">
        Дневник {__APP_VERSION__} · сборка {new Date(__BUILD_TIME__).toLocaleString('ru-RU')}
      </p>
    </div>
  )
}
