import type { PayMethod } from '../types'

export type TicketType = 'upgrade' | 'downgrade' | 'convert' | 'transfer' | 'branch_change' | 'cancel'
export type TicketStatus = 'applied' | 'pending' | 'rejected'

export const TICKET_LABEL: Record<TicketType, string> = {
  upgrade: 'Nâng cấp',
  downgrade: 'Hạ cấp',
  convert: 'Chuyển đổi',
  transfer: 'Chuyển nhượng',
  branch_change: 'Chuyển chi nhánh',
  cancel: 'Hủy hợp đồng',
}
export const TICKET_TYPES = Object.keys(TICKET_LABEL) as TicketType[]

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  applied: { label: 'Đã áp dụng', tone: 'ok' },
  pending: { label: 'Chờ duyệt', tone: 'warn' },
  rejected: { label: 'Đã từ chối', tone: 'bad' },
}

export const needsPackage = (t: TicketType) => t === 'upgrade' || t === 'downgrade' || t === 'convert'

export interface TicketQuote {
  type: TicketType
  fee: number
  requires_approval: boolean
  new_end_date: string | null
  new_sessions_total: number | null
  new_sessions_left: number | null
  refund: number | null
  note: string | null
}

export interface TicketInput {
  type: TicketType
  package_id?: string
  to_member?: { member_id?: string; name?: string; phone?: string }
  branch_id?: string
  paid?: number
  method?: PayMethod
  reason?: string
}

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(Math.abs(n)))} ₫`

/** fee > 0: khách đóng thêm; fee < 0: hoàn lại; fee = 0: không phát sinh tiền */
export function feeText(fee: number): string {
  if (fee > 0) return `Khách đóng thêm ${money(fee)}`
  if (fee < 0) return `Hoàn lại ${money(fee)}`
  return 'Không phát sinh tiền'
}

export const quoteUrl = (contractId: string) => `/contracts/${contractId}/ticket-quote`
export const createUrl = (contractId: string) => `/contracts/${contractId}/tickets`

export function quoteParams(type: TicketType, packageId: string): Record<string, string> {
  return needsPackage(type) && packageId ? { type, package_id: packageId } : { type }
}

/** Dữ liệu gửi lên khi lập phiếu; chỉ giữ trường đúng với từng loại. */
export function buildTicketBody(i: TicketInput): TicketInput {
  const body: TicketInput = { type: i.type }
  if (needsPackage(i.type) && i.package_id) body.package_id = i.package_id
  if (i.type === 'transfer' && i.to_member) body.to_member = i.to_member
  if (i.type === 'branch_change' && i.branch_id) body.branch_id = i.branch_id
  if (i.reason?.trim()) body.reason = i.reason.trim()
  if (i.paid && i.paid > 0) { body.paid = i.paid; body.method = i.method ?? 'cash' }
  return body
}

export function canSubmitTicket(type: TicketType, i: { package_id: string; phone: string; name: string; branch_id: string; reason: string }, quote: TicketQuote | null): boolean {
  if (!quote) return false
  if (needsPackage(type)) return !!i.package_id
  if (type === 'transfer') return /^0\d{9}$/.test(i.phone.trim()) && i.name.trim().length >= 2
  if (type === 'branch_change') return !!i.branch_id
  if (type === 'cancel') return i.reason.trim().length >= 3
  return true
}
