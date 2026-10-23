import { SEED_TIME } from './metrics'
import type { Circle, ContactType } from './types'

const circle = (key: string, name: string, order: number): Circle =>
  ({ key, name, order, archived: false, createdAt: SEED_TIME, updatedAt: SEED_TIME, deletedAt: null })

/** Нейтральные круги по умолчанию; свои пользователь задаёт в телефоне. */
export const DEFAULT_CIRCLES: Circle[] = [
  circle('speaker', 'Спикер / гость', 1),
  circle('friends', 'Однокурсник / друг', 2),
  circle('hr', 'Рекрутер / HR', 3),
  circle('mentor', 'Наставник / консультант', 4),
]

export const CONTACT_LABELS: Record<ContactType, string> = {
  phone: 'Телефон',
  telegram: 'Telegram',
  email: 'Почта',
  linkedin: 'LinkedIn',
  other: 'Другое',
}
