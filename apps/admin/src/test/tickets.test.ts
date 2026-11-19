import { describe, expect, it } from 'vitest'
import { buildTicketBody, canSubmitTicket, feeText, quoteParams, type TicketQuote } from '../lib/tickets'

const quote: TicketQuote = { type: 'upgrade', fee: 1000, requires_approval: false, new_end_date: null, new_sessions_total: null, new_sessions_left: null, refund: null, note: null }
const empty = { package_id: '', phone: '', name: '', branch_id: '', reason: '' }

describe('feeText', () => {
  it('says who pays', () => {
    expect(feeText(500000)).toBe('Khách đóng thêm 500.000 ₫')
    expect(feeText(-1350000)).toBe('Hoàn lại 1.350.000 ₫')
    expect(feeText(0)).toBe('Không phát sinh tiền')
  })
})

describe('quoteParams and buildTicketBody', () => {
  it('only sends the package for package-based tickets', () => {
    expect(quoteParams('upgrade', 'p1')).toEqual({ type: 'upgrade', package_id: 'p1' })
    expect(quoteParams('transfer', 'p1')).toEqual({ type: 'transfer' })
  })
  it('keeps only the fields of each type and the payment when something is collected', () => {
    expect(buildTicketBody({ type: 'transfer', package_id: 'p1', to_member: { phone: '0903123456', name: 'A' }, paid: 500000, method: 'card' }))
      .toEqual({ type: 'transfer', to_member: { phone: '0903123456', name: 'A' }, paid: 500000, method: 'card' })
    expect(buildTicketBody({ type: 'cancel', reason: ' Chuyển nhà ', paid: 0 })).toEqual({ type: 'cancel', reason: 'Chuyển nhà' })
  })
})

describe('canSubmitTicket', () => {
  it('needs a quote and the type-specific input', () => {
    expect(canSubmitTicket('upgrade', { ...empty, package_id: 'p1' }, null)).toBe(false)
    expect(canSubmitTicket('upgrade', empty, quote)).toBe(false)
    expect(canSubmitTicket('upgrade', { ...empty, package_id: 'p1' }, quote)).toBe(true)
    expect(canSubmitTicket('transfer', { ...empty, phone: '0903123456', name: 'An' }, quote)).toBe(true)
    expect(canSubmitTicket('transfer', { ...empty, phone: '123', name: 'An' }, quote)).toBe(false)
    expect(canSubmitTicket('cancel', { ...empty, reason: 'ab' }, quote)).toBe(false)
    expect(canSubmitTicket('branch_change', { ...empty, branch_id: 'b1' }, quote)).toBe(true)
  })
})
