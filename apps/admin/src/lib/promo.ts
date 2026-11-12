import type { CurrentContract, Member, PackageType, Pkg } from '../types'
import { fmtMoney, priceWithVat, todayISO } from './format'

export type PromoType = 'bonus_months' | 'bonus_days' | 'bonus_sessions' | 'percent' | 'amount'
export interface Promo { type: PromoType; value: number }

export const PROMO_OPTIONS: { value: '' | PromoType; label: string; valueLabel?: string }[] = [
  { value: '', label: 'Không áp dụng' },
  { value: 'bonus_months', label: 'Tặng tháng', valueLabel: 'Số tháng tặng' },
  { value: 'bonus_days', label: 'Tặng ngày', valueLabel: 'Số ngày tặng' },
  { value: 'bonus_sessions', label: 'Tặng buổi', valueLabel: 'Số buổi tặng' },
  { value: 'percent', label: 'Giảm theo %', valueLabel: 'Phần trăm giảm (%)' },
  { value: 'amount', label: 'Giảm theo số tiền', valueLabel: 'Số tiền giảm (đồng)' },
]

export function promoAllowed(type: '' | PromoType, pkgType: PackageType | undefined): boolean {
  if (type === 'bonus_sessions') return pkgType === 'session'
  if (type === 'bonus_months' || type === 'bonus_days') return pkgType !== 'session'
  return true
}

export const addDays = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10)

export interface Quote {
  gross: number
  discount: number
  total: number
  paid: number
  remain: number
  bonusDays: number
  bonusSessions: number
  days: number | null
  sessions: number | null
  endDate: string | null
}

export function quote(pkg: Pkg | undefined, promo: Promo | null, paidRaw: number, start: string): Quote {
  const gross = pkg ? priceWithVat(pkg.price, pkg.vat_percent) : 0
  const v = promo ? Math.max(0, Math.floor(promo.value)) : 0
  let discount = 0
  if (promo?.type === 'percent') discount = Math.round((gross * Math.min(v, 100)) / 100)
  else if (promo?.type === 'amount') discount = Math.min(v, gross)
  const total = gross - discount
  const bonusDays = promo?.type === 'bonus_months' ? v * 30 : promo?.type === 'bonus_days' ? v : 0
  const bonusSessions = promo?.type === 'bonus_sessions' ? v : 0
  const isSession = pkg?.type === 'session'
  const days = pkg && !isSession ? (pkg.duration_days ?? 30) + bonusDays : null
  const sessions = pkg && isSession ? (pkg.sessions ?? 0) + bonusSessions : null
  const paid = Math.min(paidRaw, total)
  return { gross, discount, total, paid, remain: Math.max(0, total - paid), bonusDays, bonusSessions, days, sessions, endDate: days != null && start ? addDays(start, days) : null }
}

export function priceHint(pkg: Pkg | undefined, q: Quote): string {
  if (!pkg) return ''
  const span = q.sessions != null ? `${q.sessions} buổi` : `${q.days} ngày`
  const price = q.discount > 0 ? `Giá gói ${fmtMoney(q.gross)}, sau khuyến mãi ${fmtMoney(q.total)}.` : `Giá gói ${fmtMoney(q.gross)}.`
  return `${price} Hiệu lực ${span}. Nhập số nhỏ hơn thành tiền để ghi nhận còn nợ.`
}

const LIVE: CurrentContract['status'][] = ['active', 'expired', 'frozen']

export function defaultStart(member: Pick<Member, 'current_contract'> | null, today: string = todayISO()): string {
  const c = member?.current_contract
  if (c && LIVE.includes(c.status) && c.end_date && c.end_date >= today) return addDays(c.end_date, 1)
  return today
}

export function renewedFromId(member: Pick<Member, 'current_contract'> | null): string | null {
  const c = member?.current_contract
  return c && LIVE.includes(c.status) ? c.id : null
}

export function memberBanner(member: Pick<Member, 'name' | 'code' | 'current_contract'>): string {
  return member.current_contract
    ? `Hợp đồng mới cho hội viên ${member.name} (${member.code}). Hợp đồng này được tính là gia hạn.`
    : `Hợp đồng đầu tiên của hội viên ${member.name} (${member.code}).`
}
