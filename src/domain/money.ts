/** Предел одной операции: 100 000 000 ₽ в копейках. */
export const MAX_AMOUNT = 10_000_000_000

const AMOUNT_RE = /^(\d+)(?:[.,](\d{1,2}))?$/

/** «1 250,50» → 125050 копеек. Пробелы игнорируются, запятая и точка — десятичный разделитель. */
export function parseAmount(input: string): number {
  const m = AMOUNT_RE.exec(input.replace(/[\s  ]/g, ''))
  if (!m) throw new Error('Введите сумму, например 1 250 или 99,90')
  const amount = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  if (amount <= 0) throw new Error('Сумма должна быть больше нуля')
  if (amount > MAX_AMOUNT) throw new Error('Слишком большая сумма')
  return amount
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** 125050 → «1 250,50», 125000 → «1 250», −5000 → «−50». */
export function formatAmount(kopecks: number): string {
  const sign = kopecks < 0 ? '−' : ''
  const abs = Math.abs(kopecks)
  const kop = abs % 100
  return `${sign}${group(Math.floor(abs / 100))}${kop ? `,${String(kop).padStart(2, '0')}` : ''}`
}

export const formatMoney = (kopecks: number) => `${formatAmount(kopecks)} ₽`
