import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { addPhoto, addReview, listPhotos, listReviews, removePhoto, removeReview, saveReview } from '../db/diary'
import type { ReviewPatch } from '../domain/reviews'
import type { EntryRecord, PhotoRecord } from '../domain/types'
import { errorText } from './errors'
import { primeKeyboard } from './financeUi'
import { compressPhoto, photoUrl } from './photo'

const TEXT_DELAY_MS = 500
const card = 'flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 shadow-card'

const Icon = ({ d, size = 20, className = '' }: { d: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={d} /></svg>
)
const EYE = 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'
const TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'
const CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z'
const PLUS = 'M12 5v14M5 12h14'

/** Разборы насмотренности дня: карточки и кнопка добавления. Часть формы дня. */
export default function Reviews({ day }: { day: string }) {
  const reviews = useLiveQuery(() => listReviews(day), [day])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  if (!reviews) return null

  async function add() {
    // двойной тап не создаёт второй разбор
    if (busy.current) return
    busy.current = true
    try {
      const review = await addReview(day, new Date())
      setFocusId(review.id)
      setError(null)
    } catch (e) {
      setError(`Не сохранилось: ${errorText(e)}`)
    } finally {
      busy.current = false
    }
  }

  return (
    <>
      {reviews.map((r, i) => <ReviewCard key={r.id} review={r} n={i + 1} autoFocus={r.id === focusId} />)}
      <button
        type="button"
        onClick={() => {
          primeKeyboard() // клавиатура откроется в первом поле нового разбора
          void add()
        }}
        className="flex min-h-[56px] items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-muted/60 text-[16px] font-semibold text-accent"
      >
        {reviews.length ? <><Icon d={PLUS} />Ещё разбор</> : <><Icon d={EYE} size={22} />Разбор насмотренности</>}
      </button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </>
  )
}

type FieldKey = keyof Required<ReviewPatch>

function ReviewCard({ review, n, autoFocus }: { review: EntryRecord; n: number; autoFocus: boolean }) {
  // поля живут локально: ответ базы на каждое сохранение не должен сбивать курсор
  const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
    text: review.text, verdict: review.verdict ?? '', change: review.change ?? '',
  }))
  const photos = useLiveQuery(() => listPhotos(review.id), [review.id])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState<PhotoRecord | null>(null)
  const pending = useRef<ReviewPatch>({})
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  const onFailed = useCallback((e: unknown) => setError(`Не сохранилось: ${errorText(e)}`), [])

  /** Пишет отложенные поля сразу: таймер, уход приложения в фон, закрытие формы. */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    pending.current = {}
    saveReview(review.id, patch, new Date()).then(() => setError(null), onFailed)
  }, [review.id, onFailed])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  function onField(key: FieldKey, value: string) {
    setFields((f) => ({ ...f, [key]: value }))
    pending.current = { ...pending.current, [key]: value }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, TEXT_DELAY_MS)
  }

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const files = [...(input.files ?? [])]
    input.value = '' // то же фото можно выбрать повторно
    if (!files.length) return
    setAdding(true)
    try {
      for (const file of files) await addPhoto(review.id, 'image/jpeg', await compressPhoto(file), new Date())
      setError(null)
    } catch (err) {
      setError(`Фото не добавилось: ${errorText(err)}`)
    } finally {
      setAdding(false)
    }
  }

  function remove() {
    if (!window.confirm('Удалить разбор?')) return
    pending.current = {}
    window.clearTimeout(timer.current)
    removeReview(review.id, new Date()).catch(onFailed)
  }

  const started = Object.values(fields).some((v) => v.trim()) || (photos?.length ?? 0) > 0
  return (
    <section aria-label={`Разбор ${n}`} className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Icon d={EYE} className="text-accent" />Разбор {n}</h2>
        <button
          type="button" onClick={remove} aria-label="Удалить разбор"
          className="-my-2.5 -mr-2.5 flex size-11 items-center justify-center text-muted"
        >
          <Icon d={TRASH} />
        </button>
      </div>
      <Field
        id={`${id}-text`} label="Что это, для кого, что обещает" value={fields.text} autoFocus={autoFocus} minRows={3}
        placeholder="Бренд, продукт, где увидел (полка, лента, баннер). Для кого. Что обещает"
        onChange={(v) => onField('text', v)}
      />
      <div className="flex flex-wrap gap-2">
        {photos?.map((p) => <Thumb key={p.id} photo={p} onOpen={() => setViewing(p)} />)}
        <label className="flex size-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-muted/60 text-[12px] font-semibold text-accent">
          <Icon d={CAMERA} size={22} />
          {adding ? 'Сжимаю…' : 'Фото'}
          <input type="file" accept="image/*" multiple onChange={onPhotos} disabled={adding} className="hidden" />
        </label>
      </div>
      <div className="h-px bg-line" />
      <Field
        id={`${id}-verdict`} label="Работает ли и почему" value={fields.verdict} placeholder="Твой вердикт…"
        missing={started && !fields.verdict.trim()} onChange={(v) => onField('verdict', v)}
      />
      <div className="h-px bg-line" />
      <Field
        id={`${id}-change`} label="Как сделал бы сам" value={fields.change} placeholder="Одно конкретное изменение…"
        missing={started && !fields.change.trim()} onChange={(v) => onField('change', v)}
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {viewing && (
        <PhotoViewer
          photo={viewing} onClose={() => setViewing(null)}
          onDelete={() => {
            if (!window.confirm('Удалить фото?')) return
            removePhoto(viewing.id, new Date()).then(() => setViewing(null), onFailed)
          }}
        />
      )}
    </section>
  )
}

function Field({ id, label, value, placeholder, onChange, missing = false, autoFocus = false, minRows = 2 }: {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  missing?: boolean
  autoFocus?: boolean
  minRows?: number
}) {
  const area = useRef<HTMLTextAreaElement>(null)

  // поле растёт вместе с текстом; страница прокручивается целиком
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (autoFocus) area.current?.focus()
  }, [autoFocus])

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <textarea
        id={id} ref={area} rows={minRows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="resize-none bg-transparent text-[16px] leading-[1.5] text-ink outline-none placeholder:text-muted"
      />
      {missing && (
        <span className="self-start rounded-full bg-imp-optional/25 px-2.5 py-0.5 text-xs font-semibold text-ink">
          ещё не записано
        </span>
      )}
    </div>
  )
}

function usePhotoUrl(photo: PhotoRecord): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = photoUrl(photo.bytes, photo.type)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo])
  return url
}

function Thumb({ photo, onOpen }: { photo: PhotoRecord; onOpen: () => void }) {
  const url = usePhotoUrl(photo)
  return (
    <button type="button" onClick={onOpen} aria-label="Открыть фото" className="size-[72px] overflow-hidden rounded-[14px] bg-line">
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </button>
  )
}

function PhotoViewer({ photo, onClose, onDelete }: { photo: PhotoRecord; onClose: () => void; onDelete: () => void }) {
  const url = usePhotoUrl(photo)
  const btn = 'min-h-[44px] px-2 text-[17px] font-semibold'
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/90 pt-[max(12px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]">
      <div className="flex justify-between px-4">
        <button type="button" onClick={onClose} className={`${btn} text-white`}>Закрыть</button>
        <button type="button" onClick={onDelete} className={`${btn} text-[#E08A6E]`}>Удалить фото</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        {url && <img src={url} alt="Фото к разбору" className="max-h-full max-w-full object-contain" />}
      </div>
    </div>
  )
}
