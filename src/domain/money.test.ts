import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT, formatAmount, formatMoney, parseAmount } from './money'

describe('parseAmount', () => {
  it.each<[string, number]>([
    ['450', 45000],
    ['1 250,50', 125050],
    ['1250.5', 125050],
    [' 99,9 ', 9990],
    ['1 000', 100000],
    ['0,01', 1],
    ['100000000', MAX_AMOUNT],
  ])('«%s» → %i копеек', (input, kopecks) => {
    expect(parseAmount(input)).toBe(kopecks)
  })
  it.each(['', 'abc', '-5', '12,345', '1e3', '1,2,3', '1 250 ₽'])('«%s» — не сумма', (input) => {
    expect(() => parseAmount(input)).toThrow('Введите сумму, например 1 250 или 99,90')
  })
  it.each(['0', '0,00'])('«%s» — ноль отклоняется', (input) => {
    expect(() => parseAmount(input)).toThrow('Сумма должна быть больше нуля')
  })
  it('больше 100 000 000 ₽ отклоняется', () => {
    expect(() => parseAmount('100000000,01')).toThrow('Слишком большая сумма')
  })
})

describe('formatMoney', () => {
  it.each<[number, string]>([
    [125050, '1 250,50 ₽'],
    [125000, '1 250 ₽'],
    [5, '0,05 ₽'],
    [100000000, '1 000 000 ₽'],
    [-125000, '−1 250 ₽'],
    [0, '0 ₽'],
  ])('%i → «%s»', (kopecks, text) => {
    expect(formatMoney(kopecks)).toBe(text)
  })
  it('formatAmount — без знака рубля', () => {
    expect(formatAmount(80000)).toBe('800')
  })
})
