import type { ReactNode } from 'react'
import type { FaceKind } from '../domain/types'

/** Шкала настроения 1–5: заливка мордочек и цвет дней в календаре. */
export const MOOD_COLORS = ['#A9B2BE', '#CFC9B4', '#E6D69A', '#BFD08F', '#94AC62']
const BOREDOM_FILL = '#E3DDC8'
const BLUSH = 'rgba(214,120,96,.45)'
const LINE = '#2A2D23'

/** Два чуть разных «рукописных» контура чередуются: 1, 3, 5 — первый; 2, 4 — второй. */
const OUTLINES = [
  'M24 4.6C35.2 4.1 43.6 12.8 43.4 24.3C43.2 35.6 34.9 43.7 23.6 43.4C12.4 43.1 4.4 34.8 4.7 23.5C5 12.6 13.2 5.1 24 4.6Z',
  'M23.6 4.4C35.4 4.6 43.8 13.1 43.5 24.6C43.1 35.9 34.6 43.6 23.9 43.5C12.6 43.4 4.6 35.1 4.5 23.9C4.4 12.7 12.5 4.2 23.6 4.4Z',
]

const Dot = ({ cx, cy, r = 1.9 }: { cx: number; cy: number; r?: number }) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
)
const Blush = ({ cx, cy }: { cx: number; cy: number }) => (
  <ellipse cx={cx} cy={cy} rx={3} ry={2} fill={BLUSH} stroke="none" />
)

const MOOD: ReactNode[] = [
  <>
    <path d="M14.5 17.5L20 15.2M33.5 17.5L28 15.2" />
    <Dot cx={18} cy={21.5} /><Dot cx={30} cy={21.5} />
    <path d="M16.5 34.2C19.5 28.8 28.6 28.6 31.6 34.4" />
  </>,
  <>
    <Dot cx={18} cy={21} /><Dot cx={30} cy={21} />
    <path d="M17.5 32.2C21.4 29.6 26.8 29.8 30.6 31.9" />
  </>,
  <>
    <Dot cx={18} cy={21} /><Dot cx={30} cy={21} />
    <path d="M17.8 30.6L30.2 30.1" />
  </>,
  <>
    <Blush cx={13.2} cy={27.4} /><Blush cx={34.8} cy={27.4} />
    <Dot cx={18} cy={21} /><Dot cx={30} cy={21} />
    <path d="M16.2 28.4C19.6 34.2 28.6 34.4 31.9 28.2" />
  </>,
  <>
    <Blush cx={12.8} cy={26.6} /><Blush cx={35.2} cy={26.6} />
    <path d="M14.8 21.2C16.3 18.2 19.8 18.2 21.2 21.2M26.8 21.2C28.2 18.2 31.7 18.2 33.2 21.2" />
    <path fill="currentColor" d="M15.6 27.2C17.6 36.6 30.4 36.8 32.4 27.1C26.8 28.6 21.2 28.6 15.6 27.2Z" />
  </>,
]

const BOREDOM: ReactNode[] = [
  <>
    <circle cx={18} cy={20.5} r={3.4} /><circle cx={30} cy={20.5} r={3.4} />
    <Dot cx={18.6} cy={20.8} r={1.4} /><Dot cx={30.6} cy={20.8} r={1.4} />
    <path d="M19.5 30.5C21.8 32.6 26.2 32.6 28.5 30.4" />
  </>,
  <>
    <Dot cx={18} cy={21} /><Dot cx={30} cy={21} />
    <path d="M19.5 31L28.5 30.6" />
  </>,
  <>
    <path d="M14.6 19.6L21.4 19.4M26.6 19.4L33.4 19.6" />
    <Dot cx={18} cy={22.2} r={1.7} /><Dot cx={30} cy={22.2} r={1.7} />
    <path d="M19 31.2L29 31.2" />
  </>,
  <>
    <path d="M14.8 21.6L21.2 21.8M26.8 21.8L33.2 21.6" />
    <path d="M19.5 31.8C22.5 30.4 25.8 30.6 28.8 32.2" />
  </>,
  <>
    <path d="M14.8 20.4C16.4 22.6 19.6 22.6 21.2 20.4M26.8 20.4C28.4 22.6 31.6 22.6 33.2 20.4" />
    <ellipse cx={24} cy={32} rx={3.6} ry={4.6} fill="currentColor" stroke="none" />
  </>,
]

export function Face({ kind, value, size = 48 }: { kind: FaceKind; value: number; size?: number }) {
  const fill = kind === 'mood' ? MOOD_COLORS[value - 1] : BOREDOM_FILL
  const features = (kind === 'mood' ? MOOD : BOREDOM)[value - 1]
  return (
    <svg
      viewBox="0 0 48 48" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: LINE }}
    >
      <path fill={fill} d={OUTLINES[(value - 1) % 2]} />
      {features}
    </svg>
  )
}
