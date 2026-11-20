import { toCSV } from './format'
import type { StaffPosition, StaffRow } from '../types'

export const STAFF_POSITION_LABEL: Record<StaffPosition, string> = {
  pt_fulltime: 'PT Fulltime',
  pt_parttime: 'PT Parttime',
  marketing: 'Marketing',
  sale: 'Sale',
  reception: 'Lễ tân',
  other: 'Khác',
}
export const STAFF_POSITIONS = Object.keys(STAFF_POSITION_LABEL) as StaffPosition[]

export type StaffGroup = 'all' | 'pt' | 'sale' | 'other'
export const STAFF_GROUPS: { value: StaffGroup; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pt', label: 'PT' },
  { value: 'sale', label: 'Sale và Marketing' },
  { value: 'other', label: 'Lễ tân và khác' },
]

export const isPt = (p: StaffPosition) => p === 'pt_fulltime' || p === 'pt_parttime'

export function inGroup(p: StaffPosition, g: StaffGroup): boolean {
  if (g === 'all') return true
  if (g === 'pt') return isPt(p)
  if (g === 'sale') return p === 'sale' || p === 'marketing'
  return p === 'reception' || p === 'other'
}

/** Tháng YYYY-MM dịch n tháng. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-11" -> "Tháng 11/2026"; "2026-11" ngắn -> "11/26". */
export const monthLabel = (month: string) => `Tháng ${month.slice(5)}/${month.slice(0, 4)}`
export const monthShort = (month: string) => `${month.slice(5)}/${month.slice(2, 4)}`

export interface Delta { text: string; tone: 'ok' | 'bad' | null }

/** So với tháng trước: phần trăm đổi, "Mới" khi tháng trước 0, không có gì khi cả hai 0. */
export function delta(cur: number, prev: number): Delta | null {
  if (!cur && !prev) return null
  if (!prev) return { text: 'Mới', tone: 'ok' }
  const p = Math.round(((cur - prev) / prev) * 100)
  if (p === 0) return { text: '0%', tone: null }
  return { text: `${p > 0 ? '+' : ''}${p}%`, tone: p > 0 ? 'ok' : 'bad' }
}

/** Tỉ lệ 0..1 thành "85%", null thành "-". */
export const fmtRate = (r: number | null | undefined) => (r == null ? '-' : `${Math.round(r * 100)}%`)

export const dash = (n: number) => (n ? String(n) : '-')

export function staffTotals(rows: StaffRow[]) {
  const t = { contracts: 0, revenue: 0, customers: 0, sessions: 0, pContracts: 0, pRevenue: 0, pCustomers: 0, pSessions: 0 }
  for (const r of rows) {
    t.contracts += r.kpi.contracts_sold
    t.revenue += r.kpi.revenue
    t.customers += r.kpi.new_customers
    t.sessions += r.kpi.sessions_taught
    t.pContracts += r.prev.contracts_sold
    t.pRevenue += r.prev.revenue
    t.pCustomers += r.prev.new_customers
    t.pSessions += r.prev.sessions_taught
  }
  return t
}

export function staffCsv(rows: StaffRow[]): string {
  const head = ['Nhân viên', 'Số điện thoại', 'Vị trí', 'Chi nhánh', 'Hợp đồng', 'Khách mới', 'Doanh số', 'Doanh số tháng trước', 'Xếp hạng', 'Khách đang phụ trách', 'Buổi dạy', 'Tỷ lệ hoàn thành', 'Tồn buổi', 'Sắp hết hạn 30 ngày', 'Tỷ lệ tái ký', 'Còn nợ']
  const body = rows.map((r) => {
    const pt = isPt(r.position)
    return [
      r.name, r.phone, STAFF_POSITION_LABEL[r.position], r.branches.map((b) => b.name).join('; '),
      r.kpi.contracts_sold, r.kpi.new_customers, r.kpi.revenue, r.prev.revenue, r.rank.revenue,
      pt ? r.kpi.active_clients : '', pt ? r.kpi.sessions_taught : '', pt ? fmtRate(r.kpi.session_done_rate) : '',
      pt ? r.kpi.sessions_left_total : '', pt ? r.kpi.expiring_30 : '', pt ? fmtRate(r.kpi.renewal_rate) : '', r.kpi.debt_outstanding,
    ]
  })
  return toCSV([head, ...body])
}
