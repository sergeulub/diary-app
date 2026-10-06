import { exportSnapshot, setMeta } from '../db/diary'
import { isoWithOffset } from '../domain/dates'
import { buildExportZip } from '../domain/exportFormat'
import { shareOrDownload } from './shareFile'

/** Снимок базы → zip. `at` — момент снимка; он же станет lastExportAt. */
export async function prepareExportFile(at: Date): Promise<File> {
  const { fileName, bytes } = buildExportZip(await exportSnapshot(), at)
  // копия в обычный ArrayBuffer: fflate отдаёт Uint8Array<ArrayBufferLike>, а BlobPart его не принимает
  return new File([new Uint8Array(bytes)], fileName, { type: 'application/zip' })
}

export type ExportResult = { kind: 'done'; how: 'shared' | 'downloaded' } | { kind: 'cancelled' } | { kind: 'needs-tap' }

/**
 * Вызывать синхронно из обработчика нажатия: navigator.share требует свежего жеста.
 * NotAllowedError (жест «истёк», пока готовился zip) → 'needs-tap': показать кнопку «Отправить файл».
 */
export async function deliverExport(file: File, at: Date): Promise<ExportResult> {
  let how: 'shared' | 'downloaded' | 'cancelled'
  try {
    how = await shareOrDownload(file)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotAllowedError') return { kind: 'needs-tap' }
    throw e
  }
  if (how === 'cancelled') return { kind: 'cancelled' }
  // правки, сделанные после снимка, попадут в следующий экспорт
  await setMeta('lastExportAt', isoWithOffset(at))
  return { kind: 'done', how }
}
