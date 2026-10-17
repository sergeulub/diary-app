const MAX_SIDE = 1600
const QUALITY = 0.8

/** Фото с камеры или из галереи → JPEG с длинной стороной не больше 1600 px. */
export async function compressPhoto(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('Не удалось сжать фото')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Адрес для <img> на время жизни компонента; освобождать через URL.revokeObjectURL. */
export const photoUrl = (bytes: Uint8Array, type: string) => URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))
