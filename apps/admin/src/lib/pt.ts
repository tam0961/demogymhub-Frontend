export const PT_SESSION_THRESHOLD = 30

const pad = (n: number) => String(n).padStart(2, '0')

export function addMonths(iso: string, n: number): string {
  const y = +iso.slice(0, 4)
  const m = +iso.slice(5, 7) - 1
  const d = +iso.slice(8, 10)
  const total = y * 12 + m + n
  const ny = Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`
}

export const ptUsageMonths = (sessions: number | null | undefined) => ((sessions ?? 0) > PT_SESSION_THRESHOLD ? 6 : 3)

export function ptUsageDeadline(endDate: string | null | undefined, sessions: number | null | undefined): string | null {
  return endDate ? addMonths(endDate, ptUsageMonths(sessions)) : null
}

export const PT_RULE_HINT = 'Chỉ áp dụng cho gói PT 1:1: HSD = ngày hết hạn + 3 tháng (từ 30 buổi trở xuống) hoặc + 6 tháng (trên 30 buổi).'
export const hasHsd = (category: string | null | undefined) => category === 'pt_1on1'
export const hsdRuleText = (sessions: number | null | undefined) => `+${ptUsageMonths(sessions)} tháng sau hết hạn`
