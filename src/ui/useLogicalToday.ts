import { useEffect, useState } from 'react'
import { logicalDay } from '../domain/logicalDay'

/**
 * Текущий логический день. Пересчитывается при возвращении в приложение и раз в минуту:
 * iOS держит веб-приложение в памяти, и открытое вчера вечером не должно показывать вчерашний день.
 */
export function useLogicalToday(boundaryHour: number): string {
  const [today, setToday] = useState(() => logicalDay(new Date(), boundaryHour))
  useEffect(() => {
    const update = () => setToday(logicalDay(new Date(), boundaryHour))
    update()
    const id = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [boundaryHour])
  return today
}
