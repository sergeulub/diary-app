import { monthOf } from './dates'
import type { EntryRecord, PhotoRecord } from './types'

/** Разбор насмотренности — запись дня с kind: 'review'. */
export function createReview(day: string, now: string): EntryRecord {
  return {
    id: crypto.randomUUID(), day, kind: 'review', text: '', verdict: '', change: '',
    createdAt: now, updatedAt: now, deletedAt: null,
  }
}

export interface ReviewPatch {
  text?: string
  verdict?: string
  change?: string
}

export function applyReviewPatch(e: EntryRecord, patch: ReviewPatch, now: string): EntryRecord {
  return { ...e, ...patch, updatedAt: now }
}

export function deleteReview(e: EntryRecord, now: string): EntryRecord {
  return { ...e, deletedAt: now, updatedAt: now }
}

export function createPhoto(entry: EntryRecord, type: string, bytes: Uint8Array, now: string): PhotoRecord {
  return {
    id: crypto.randomUUID(), entryId: entry.id, day: entry.day, type, bytes,
    createdAt: now, updatedAt: now, deletedAt: null,
  }
}

/** Удалённое фото не держит байты: место в хранилище освобождается. */
export function deletePhoto(p: PhotoRecord, now: string): PhotoRecord {
  return { ...p, bytes: new Uint8Array(0), deletedAt: now, updatedAt: now }
}

const byCreated = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(a.createdAt) - Date.parse(b.createdAt)

export function livePhotos(photos: PhotoRecord[], entryId: string): PhotoRecord[] {
  return photos.filter((p) => p.entryId === entryId && !p.deletedAt).sort(byCreated)
}

const isLiveReview = (e: EntryRecord) => e.kind === 'review' && !e.deletedAt

export function reviewsOfDay(entries: EntryRecord[], day: string): EntryRecord[] {
  return entries.filter((e) => isLiveReview(e) && e.day === day).sort(byCreated)
}

/** Ни строчки текста и ни одного живого фото — такой разбор нигде не считается. */
export function isReviewEmpty(e: EntryRecord, photos: PhotoRecord[]): boolean {
  const blank = [e.text, e.verdict, e.change].every((s) => !s?.trim())
  return blank && livePhotos(photos, e.id).length === 0
}

/** Непустые живые разборы месяца ГГГГ-ММ. */
export function countReviews(entries: EntryRecord[], photos: PhotoRecord[], month: string): number {
  return entries.filter((e) => isLiveReview(e) && monthOf(e.day) === month && !isReviewEmpty(e, photos)).length
}
