const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Баннер «Сделай бэкап»: записей ≥ 3 и экспорта не было или он старше 7 дней. */
export function needsBackupReminder(lastExportAt: string | null, filledCount: number, now: Date): boolean {
  if (filledCount < 3) return false
  if (!lastExportAt) return true
  return now.getTime() - Date.parse(lastExportAt) > WEEK_MS
}
