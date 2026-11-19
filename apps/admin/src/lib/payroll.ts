import type { PayrollPosition, PayrollRow, PayrollTaxMode, PayrollTier } from '../types'

export const POSITION_LABEL: Record<PayrollPosition, string> = {
  pt_fulltime: 'PT Fulltime',
  pt_parttime: 'PT Parttime',
  marketing: 'Marketing',
  sale: 'Sale',
  other: 'Khác',
}

export const TAX_MODE_LABEL: Record<PayrollTaxMode, string> = {
  progressive: 'Biểu lũy tiến',
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
