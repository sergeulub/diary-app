import { describe, expect, it } from 'vitest'
import {
  applyReviewPatch, countReviews, createPhoto, createReview, deletePhoto, deleteReview, isReviewEmpty, livePhotos,
  reviewsOfDay,
} from './reviews'
import { T0, photoRec, reviewRec } from './testFixtures'

const NOW = '2026-10-17T22:00:00.000+03:00'
const LATER = '2026-10-17T22:05:00.000+03:00'

describe('createReview', () => {
  it('пустой разбор дня с UUID и метками', () => {
    const r = createReview('2026-10-17', NOW)
    expect(r).toMatchObject({
      day: '2026-10-17', kind: 'review', text: '', verdict: '', change: '', createdAt: NOW, updatedAt: NOW, deletedAt: null,
    })
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('applyReviewPatch и удаление', () => {
  it('меняет только переданные поля, текст не обрезает', () => {
    const r = applyReviewPatch(reviewRec('2026-10-17', { text: 'Йогурт' }), { verdict: ' Работает ' }, LATER)
    expect(r).toMatchObject({ text: 'Йогурт', verdict: ' Работает ', change: '', updatedAt: LATER })
  })
  it('deleteReview ставит deletedAt и updatedAt', () => {
    expect(deleteReview(reviewRec('2026-10-17'), LATER)).toMatchObject({ deletedAt: LATER, updatedAt: LATER })
  })
})

describe('фото', () => {
  it('createPhoto берёт день и id записи', () => {
    const r = reviewRec('2026-10-17')
    const p = createPhoto(r, 'image/jpeg', new Uint8Array([1, 2]), NOW)
    expect(p).toMatchObject({ entryId: r.id, day: '2026-10-17', type: 'image/jpeg', createdAt: NOW, deletedAt: null })
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('deletePhoto освобождает байты', () => {
    const p = deletePhoto(photoRec('e1'), LATER)
    expect(p.deletedAt).toBe(LATER)
    expect(p.bytes.length).toBe(0)
  })
  it('livePhotos — живые фото записи по времени добавления', () => {
    const a = photoRec('e1', { createdAt: LATER })
    const b = photoRec('e1', { createdAt: NOW })
    const gone = photoRec('e1', { deletedAt: LATER })
    const other = photoRec('e2')
    expect(livePhotos([a, gone, other, b], 'e1')).toEqual([b, a])
  })
})

describe('reviewsOfDay', () => {
  it('живые разборы дня по времени создания', () => {
    const a = reviewRec('2026-10-17', { createdAt: LATER })
    const b = reviewRec('2026-10-17', { createdAt: T0 })
    const gone = reviewRec('2026-10-17', { deletedAt: LATER })
    const other = reviewRec('2026-10-16')
    expect(reviewsOfDay([a, gone, other, b], '2026-10-17')).toEqual([b, a])
  })
})

describe('isReviewEmpty и countReviews', () => {
  it('пробелы — пусто; живое фото — не пусто', () => {
    const r = reviewRec('2026-10-17', { text: '  ', verdict: '\n' })
    expect(isReviewEmpty(r, [])).toBe(true)
    expect(isReviewEmpty(r, [photoRec(r.id, { deletedAt: LATER })])).toBe(true)
    expect(isReviewEmpty(r, [photoRec(r.id)])).toBe(false)
    expect(isReviewEmpty(reviewRec('2026-10-17', { change: 'Крышку ярче' }), [])).toBe(false)
  })
  it('считает непустые живые разборы месяца', () => {
    const entries = [
      reviewRec('2026-10-03', { text: 'Чипсы' }),
      reviewRec('2026-10-17', { verdict: 'Работает' }),
      reviewRec('2026-10-17', { text: 'Кофе' }),
      reviewRec('2026-10-17'), // пустой
      reviewRec('2026-10-10', { text: 'Баннер', deletedAt: LATER }),
      reviewRec('2026-11-01', { text: 'Шампунь' }),
    ]
    expect(countReviews(entries, [], '2026-10')).toBe(3)
  })
})
