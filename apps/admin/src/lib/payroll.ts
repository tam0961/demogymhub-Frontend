import type { PayrollPosition, PayrollRow, PayrollSettings, PayrollTaxMode, PayrollTier } from '../types'

export const POSITION_LABEL: Record<PayrollPosition, string> = {
  pt_fulltime: 'PT Fulltime',
  pt_parttime: 'PT Parttime',
  marketing: 'Marketing',
  sale: 'Sale',
  other: 'Khác',
}

export const TAX_MODE_LABEL: Record<PayrollTaxMode, string> = {
  progressive: 'Thuế cố định',
  flat10: '10% tổng thu nhập',
  none: 'Không thuế',
}

export const POSITIONS = Object.keys(POSITION_LABEL) as PayrollPosition[]
export const TAX_MODES = Object.keys(TAX_MODE_LABEL) as PayrollTaxMode[]

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

/** Số triệu gọn: 15000000 -> "15 triệu", 1500000 -> "1,5 triệu", 500000 -> "500.000 ₫". */
export function millions(n: number): string {
  if (n >= 1_000_000) return `${nf.format(n / 1_000_000)} triệu`
  return `${nf.format(n)} ₫`
}

export function pct(rate: number): string {
  return `${nf.format(rate)}%`
}

/** Dòng mô tả một bậc: "0 - 15 triệu: 1,5%", "Trên 35 triệu: 4,5%". */
export function tierLine(tiers: PayrollTier[], index: number): string {
  const t = tiers[index]
  if (!t) return ''
  const from = index === 0 ? 0 : (tiers[index - 1].upTo ?? 0)
  if (t.upTo == null) return `Trên ${millions(from)}: ${pct(t.rate)}`
  return `${millions(from)} - ${millions(t.upTo)}: ${pct(t.rate)}`
}

/** Tách tổng tỷ lệ PT thành phần nhận liền và phần chia theo buổi (rate là phần trăm). */
export function ptSplit(rate: number, immediateShare: number, sessionShare: number): { immediate: number; session: number } {
  return { immediate: rate * immediateShare, session: rate * sessionShare }
}

export const NUMERIC_KEYS = [
  'base_salary', 'member_sales', 'member_commission', 'marketing_commission', 'pt_sales', 'pt_immediate',
  'pt_session_pay', 'pt_sessions_taught', 'group_classes', 'group_pay', 'gross', 'insurance', 'tax', 'penalty', 'adjustment', 'net',
] as const

export const currentMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

/** Thu nhập tính từ các thành phần, dùng để kiểm tra dòng lương hiển thị. */
export function grossOf(r: Pick<PayrollRow, 'base_salary' | 'member_commission' | 'marketing_commission' | 'pt_immediate' | 'pt_session_pay' | 'group_pay'>): number {
  return r.base_salary + r.member_commission + r.marketing_commission + r.pt_immediate + r.pt_session_pay + r.group_pay
}

export function netOf(r: Pick<PayrollRow, 'gross' | 'insurance' | 'tax' | 'penalty' | 'adjustment'>): number {
  return r.gross - r.insurance - r.tax - r.penalty + r.adjustment
}

export type SimPosition = 'pt_fulltime' | 'pt_parttime' | 'marketing'
export const SIM_POSITIONS: SimPosition[] = ['pt_fulltime', 'pt_parttime', 'marketing']

export interface Applies {
  memberTiers: boolean
  marketingTiers: boolean
  ptFund: boolean
  ptSession: boolean
  groupClass: boolean
  insurance: boolean
  flatTax: boolean
}

/** Khoản nào áp dụng cho vị trí nào (khớp calc.ts của backend). */
export function appliesTo(pos: SimPosition): Applies {
  const pt = pos !== 'marketing'
  return { memberTiers: true, marketingTiers: pos === 'marketing', ptFund: true, ptSession: pt, groupClass: pt, insurance: pos !== 'pt_parttime', flatTax: pos === 'pt_parttime' }
}

/** Lũy tiến từng phần (Bảng 1, Bảng 4, biểu thuế). */
export function marginal(amount: number, tiers: PayrollTier[]): number {
  if (amount <= 0) return 0
  let prev = 0
  let total = 0
  for (const t of tiers) {
    const top = t.upTo ?? Number.POSITIVE_INFINITY
    const slice = Math.min(amount, top) - prev
    if (slice > 0) total += (slice * t.rate) / 100
    if (amount <= top) break
    prev = top
  }
  return Math.round(total)
}

/** Một tỷ lệ cho cả tháng (Bảng 2): bậc đầu tiên có cận trên lớn hơn số tiền. */
export function flatRate(amount: number, tiers: PayrollTier[]): number {
  if (amount <= 0 || !tiers.length) return 0
  for (const t of tiers) if (t.upTo === null || amount < t.upTo) return t.rate
  return tiers[tiers.length - 1].rate
}

export interface SimInput {
  position: SimPosition
  baseSalary: number
  memberSales: number
  gymMemberTotal: number
  ptSales: number
  ptTotalSessions: number
  ptSessionsTaught: number
  groupClasses: number
  penalty: number
}

export interface SimResult {
  base: number
  memberCommission: number
  marketingCommission: number
  ptRate: number
  ptFund: number
  ptImmediate: number
  ptSessionUnit: number
  ptSessionPay: number
  groupPay: number
  gross: number
  insurance: number
  tax: number
  penalty: number
  deductions: number
  net: number
}

/** Tính thử lương, cùng công thức với computeRow trong backend. Số buổi dạy được chia theo tổng buổi của gói. */
export function computeSim(i: SimInput, s: PayrollSettings): SimResult {
  const a = appliesTo(i.position)
  const base = Math.max(0, Math.round(i.baseSalary))
  const memberCommission = marginal(i.memberSales, s.memberTiers)
  const marketingCommission = a.marketingTiers ? marginal(i.gymMemberTotal, s.marketingTiers) : 0
  const ptRate = flatRate(i.ptSales, s.ptTiers)
  const ptFund = (ptRate / 100) * i.ptSales
  const ptImmediate = Math.round(s.ptImmediateShare * ptFund)
  const ptSessionUnit = a.ptSession && i.ptTotalSessions > 0 ? (s.ptSessionShare * ptFund) / i.ptTotalSessions : 0
  const ptSessionPay = a.ptSession ? Math.round(ptSessionUnit * i.ptSessionsTaught) : 0
  const groupPay = a.groupClass ? i.groupClasses * s.classRate : 0
  const gross = base + memberCommission + marketingCommission + ptImmediate + ptSessionPay + groupPay
  const insurance = a.insurance ? Math.round(((s.insuranceBase ?? base) * s.insuranceRate) / 100) : 0
  let tax = 0
  if (a.flatTax) tax = Math.round((gross * s.partTimeTaxRate) / 100)
  else if (!s.taxBrackets.length) tax = Math.max(0, Math.round(s.fixedTax))
  else tax = marginal(Math.max(0, gross - insurance - (s.personalDeduction ?? 0)), s.taxBrackets)
  const deductions = insurance + tax + i.penalty
  return { base, memberCommission, marketingCommission, ptRate, ptFund, ptImmediate, ptSessionUnit, ptSessionPay, groupPay, gross, insurance, tax, penalty: i.penalty, deductions, net: gross - deductions }
}

/** Nhãn khoảng của một bậc: "Dưới 15 triệu", "15 – 25 triệu", "Trên 35 triệu". */
export function bandLabel(tiers: PayrollTier[], index: number): string {
  const t = tiers[index]
  if (!t) return ''
  const from = index === 0 ? 0 : (tiers[index - 1].upTo ?? 0)
  if (index === 0 && t.upTo != null) return `Dưới ${millions(t.upTo)}`
  if (t.upTo == null) return `Trên ${millions(from)}`
  return `${millions(from)} – ${millions(t.upTo)}`
}

/** Nhãn bậc lũy tiến (Bảng 1): "0 – 15 triệu", "> 15 – 25 triệu", "Trên 35 triệu". */
export function progressiveLabel(tiers: PayrollTier[], index: number): string {
  const t = tiers[index]
  if (!t) return ''
  const from = index === 0 ? 0 : (tiers[index - 1].upTo ?? 0)
  if (t.upTo == null) return `Trên ${millions(from)}`
  return `${index === 0 ? '0' : `> ${millions(from).replace(' triệu', '')}`} – ${millions(t.upTo)}`
}

const INSURANCE_SHARES = [
  { key: 'BHXH', rate: 8 },
  { key: 'BHTN', rate: 1 },
  { key: 'BHYT', rate: 1.5 },
] as const

/** Tách bảo hiểm NLĐ thành BHXH, BHTN, BHYT theo tỷ lệ 8 : 1 : 1,5 trên mức đóng. */
export function insuranceParts(base: number, totalRate: number) {
  const k = totalRate / 10.5
  return INSURANCE_SHARES.map((p) => ({ key: p.key, rate: p.rate * k, amount: Math.round((base * p.rate * k) / 100) }))
}
