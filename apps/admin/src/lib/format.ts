import type { CheckinReason, Contract, ContractStatus, PackageType, PayMethod, PayStatus } from '../types'

export const fmtMoney = (n: number | null | undefined) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0))} ₫`
const pad = (n: number) => String(n).padStart(2, '0')
export const fmtDate = (s: string | null | undefined) => {
  if (!s) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '-' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
export const fmtTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-')
export const todayISO = () => new Date().toISOString().slice(0, 10)

const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000
export function daysLeft(end: string | null | undefined, today: string = todayISO()): number | null {
  if (!end) return null
  return Math.round(dayNum(end) - dayNum(today))
}
export function daysLeftText(end: string | null | undefined, today: string = todayISO()): string {
  const n = daysLeft(end, today)
  if (n == null) return ''
  if (n < 0) return `Quá hạn ${-n} ngày`
  if (n === 0) return 'Hết hạn hôm nay'
  return `Còn ${n} ngày`
}

export type ChipTone = 'ok' | 'warn' | 'bad' | 'neutral'
export function memberStatus(
  c: { status: ContractStatus; end_date?: string | null } | null | undefined,
  today: string = todayISO(),
): { label: string; tone: ChipTone } {
  if (!c) return { label: 'Chưa kích hoạt', tone: 'neutral' }
  switch (c.status) {
    case 'draft': return { label: 'Chờ ký', tone: 'warn' }
    case 'signed': return { label: 'Chưa kích hoạt', tone: 'warn' }
    case 'frozen': return { label: 'Bảo lưu', tone: 'neutral' }
    case 'cancelled': return { label: 'Đã hủy', tone: 'bad' }
    case 'expired': return { label: 'Hết hạn', tone: 'bad' }
    case 'active': {
      const n = daysLeft(c.end_date, today)
      if (n != null && n < 0) return { label: 'Hết hạn', tone: 'bad' }
      if (n != null && n <= 7) return { label: 'Sắp hết hạn', tone: 'warn' }
      return { label: 'Còn hạn', tone: 'ok' }
    }
  }
}

export const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[w.length - 1][0]).toUpperCase()
}

export const packageKind = (t: PackageType, name = '') => (/combo/i.test(name) ? 'Combo' : t === 'session' ? 'PT' : t === 'day' ? 'Lớp' : 'Gym')
export const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' } as const
export const parseMoney = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0

type Tone = 'ok' | 'warn' | 'bad' | undefined
export const CONTRACT_STATUS: Record<ContractStatus, { tone: Tone; label: string }> = {
  draft: { tone: undefined, label: 'Nháp' },
  signed: { tone: 'warn', label: 'Đã ký, chưa kích hoạt' },
  active: { tone: 'ok', label: 'Đang hiệu lực' },
  frozen: { tone: 'warn', label: 'Bảo lưu' },
  expired: { tone: 'bad', label: 'Hết hạn' },
  cancelled: { tone: 'bad', label: 'Đã hủy' },
}
export const PAY_STATUS: Record<PayStatus, { tone: Tone; label: string }> = {
  pending: { tone: 'warn', label: 'Chờ xác nhận' },
  confirmed: { tone: 'ok', label: 'Đã thu' },
  failed: { tone: 'bad', label: 'Thất bại' },
  refunded: { tone: undefined, label: 'Đã hoàn' },
}
export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', vietqr: 'VietQR', ewallet: 'Ví điện tử' }
export const METHODS = Object.keys(METHOD_LABEL) as PayMethod[]

export const EVENT_LABEL: Record<string, string> = {
  created: 'Tạo hợp đồng', signed: 'Đã ký', activated: 'Kích hoạt', renewed: 'Gia hạn', frozen: 'Bảo lưu',
  unfrozen: 'Hết bảo lưu', cancelled: 'Hủy hợp đồng', payment: 'Thanh toán', expired: 'Hết hạn',
  payment_created: 'Ghi nhận thu tiền', payment_confirmed: 'Đã thu tiền', payment_refunded: 'Đã hoàn tiền', refund_requested: 'Đề nghị hoàn tiền',
}

export const CHECKIN_REASON: Record<string, string> = {
  NO_ACTIVE_CONTRACT: 'Chưa có hợp đồng đang hiệu lực',
  EXPIRED: 'Hợp đồng đã hết hạn',
  FROZEN: 'Hợp đồng đang bảo lưu',
  NO_SESSIONS: 'Đã hết số buổi',
  WRONG_BRANCH: 'Sai chi nhánh',
  NOT_CHECKED_IN: 'Hội viên chưa check-in',
}
export const reasonText = (r: CheckinReason | string | null | undefined) => (r ? CHECKIN_REASON[r] ?? 'Không đủ điều kiện vào' : '')

export interface ContractActions {
  sign: boolean
  pay: boolean
  activate: boolean
  activateBlockedByDebt: boolean
  activateWithDebt: boolean
  renew: boolean
  freeze: boolean
  unfreeze: boolean
  cancel: boolean
  pdf: boolean
  primary: 'sign' | 'activate' | 'pay' | null
}

export function contractActions(c: Pick<Contract, 'status' | 'debt_amount'>, can: (p: string) => boolean): ContractActions {
  const live = c.status !== 'cancelled' && c.status !== 'expired'
  const sign = c.status === 'draft' && can('contracts.sign')
  const pay = live && c.debt_amount > 0 && can('payments.create')
  const activateStatus = c.status === 'signed' && can('contracts.activate')
  const blocked = activateStatus && c.debt_amount > 0
  const activate = activateStatus && !blocked
  const activateWithDebt = blocked && can('contracts.approve')
  const primary: ContractActions['primary'] = sign ? 'sign' : activate ? 'activate' : pay ? 'pay' : null
  return {
    sign,
    pay,
    activate,
    activateBlockedByDebt: blocked,
    activateWithDebt,
    renew: (c.status === 'active' || c.status === 'expired') && can('contracts.create'),
    freeze: c.status === 'active' && can('contracts.freeze'),
    unfreeze: c.status === 'frozen' && can('contracts.freeze'),
    cancel: live && can('contracts.cancel'),
    pdf: can('contracts.read'),
    primary,
  }
}

export type DiffTone = 'ok' | 'warn' | 'bad'
export const diffTone = (d: number): DiffTone => (d === 0 ? 'ok' : Math.abs(d) <= 50000 ? 'warn' : 'bad')

export interface RoleDiff { add: string[]; remove: string[] }
export function diffRoles(before: string[], after: string[]): RoleDiff {
  return { add: after.filter((r) => !before.includes(r)), remove: before.filter((r) => !after.includes(r)) }
}
export const PRIVILEGED_ROLES = ['admin', 'owner', 'super_admin']
export const needsConfirm = (d: RoleDiff) => [...d.add, ...d.remove].some((r) => PRIVILEGED_ROLES.includes(r))

export function toCSV(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export function barLayout(values: number[], height: number) {
  const max = Math.max(1, ...values)
  return values.map((v) => Math.round((v / max) * height))
}

export function priceWithVat(price: number, vat: number) {
  return Math.round(price * (1 + vat / 100))
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
