/**
 * Вывод проверки изоляции для «Пробы 2».
 * Основной «Дневник» пишет в localStorage отметку {"at": ISO, "standalone": boolean}.
 * Отметку из вкладки Safari iOS могла перенести при установке, поэтому «общее» — только отметка установленного приложения.
 * @param {{ selfStandalone: boolean, markerRaw: string | null }} input
 * @returns {{ kind: 'not-standalone' | 'shared' | 'isolated' | 'unknown', text: string }}
 */
export function isolationVerdict({ selfStandalone, markerRaw }) {
  if (!selfStandalone) {
    return {
      kind: 'not-standalone',
      text: 'Это вкладка Safari. Добавьте «Пробу 2» на экран «Домой» и откройте с иконки',
    }
  }
  if (!markerRaw) {
    return { kind: 'isolated', text: 'Хранилище ИЗОЛИРОВАНО: отметок «Дневника» не видно' }
  }
  let marker
  try {
    marker = JSON.parse(markerRaw)
  } catch {
    marker = null
  }
  if (!marker || typeof marker.standalone !== 'boolean') {
    return { kind: 'unknown', text: 'Неясно: старая отметка без источника. Откройте «Дневник» с иконки и вернитесь сюда' }
  }
  return marker.standalone
    ? { kind: 'shared', text: 'Хранилище ОБЩЕЕ с установленным «Дневником»' }
    : {
        kind: 'isolated',
        text: 'Хранилище ИЗОЛИРОВАНО от установленного «Дневника»: видна только отметка из вкладки Safari',
      }
}
