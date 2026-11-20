import type { DayTicketMethod } from '../types'

export const DAY_TICKET_PRICE = 100000

export const DAY_TICKET_METHODS: { value: DayTicketMethod; label: string }[] = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'card', label: 'Quẹt thẻ' },
  { value: 'momo', label: 'MoMo' },
]

export const normalizePhone = (s: string) => s.replace(/[\s.\-()]/g, '')
export const validPhone = (s: string) => /^\+?\d{9,15}$/.test(normalizePhone(s))

export function canSellDayTicket(f: { name: string; phone: string }) {
  return f.name.trim().length > 0 && validPhone(f.phone)
}

export const saleBody = (f: { name: string; phone: string; method: DayTicketMethod }, branch: string) => ({
  name: f.name.trim(),
  phone: normalizePhone(f.phone),
  method: f.method,
  ...(branch ? { branch_id: branch } : {}),
})
