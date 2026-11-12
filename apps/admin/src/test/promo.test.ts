import { describe, expect, it } from 'vitest'
import { defaultStart, memberBanner, priceHint, promoAllowed, quote, renewedFromId } from '../lib/promo'
import type { CurrentContract, Pkg } from '../types'

const month: Pkg = { id: 'p', name: 'Member 1 tháng', type: 'month', duration_days: 30, sessions: null, price: 648148, vat_percent: 8, branch_id: null, active: true }
const m700: Pkg = { ...month, price: 700000, vat_percent: 0 }
const pt: Pkg = { ...month, type: 'session', duration_days: null, sessions: 12, price: 3000000, vat_percent: 0 }
const cc = (o: Partial<CurrentContract>): CurrentContract => ({ id: 'c1', code: 'HD1', status: 'active', package_name: 'x', package_type: 'month', start_date: '2026-10-01', end_date: '2026-11-20', sessions_left: null, ...o })

describe('quote', () => {
  it('no promo: price, end date and remaining debt', () => {
    const q = quote(m700, null, 0, '2026-11-12')
    expect(q).toMatchObject({ gross: 700000, discount: 0, total: 700000, remain: 700000, endDate: '2026-12-12', days: 30 })
    expect(quote(m700, null, 700000, '2026-11-12').remain).toBe(0)
    expect(quote(m700, null, 900000, '2026-11-12').paid).toBe(700000)
  })
  it('percent and amount reduce the price, capped', () => {
    expect(quote(m700, { type: 'percent', value: 10 }, 0, '2026-11-12')).toMatchObject({ discount: 70000, total: 630000 })
    expect(quote(m700, { type: 'percent', value: 150 }, 0, '2026-11-12').total).toBe(0)
    expect(quote(m700, { type: 'amount', value: 100000 }, 0, '2026-11-12')).toMatchObject({ discount: 100000, total: 600000 })
    expect(quote(m700, { type: 'amount', value: 9e9 }, 0, '2026-11-12').total).toBe(0)
  })
  it('bonus months add 30 days each, bonus days add days', () => {
    expect(quote(m700, { type: 'bonus_months', value: 2 }, 0, '2026-11-12')).toMatchObject({ days: 90, endDate: '2027-02-10', total: 700000 })
    expect(quote(m700, { type: 'bonus_days', value: 5 }, 0, '2026-11-12')).toMatchObject({ days: 35, endDate: '2026-12-17' })
  })
  it('session packages have no end date and bonus sessions add sessions', () => {
    expect(quote(pt, null, 0, '2026-11-12')).toMatchObject({ sessions: 12, endDate: null })
    expect(quote(pt, { type: 'bonus_sessions', value: 3 }, 0, '2026-11-12')).toMatchObject({ sessions: 15, endDate: null })
  })
  it('price includes VAT', () => {
    expect(quote(month, null, 0, '2026-11-12').gross).toBe(700000)
  })
})

describe('promoAllowed', () => {
  it('bonus sessions only for session packages, bonus days and months not', () => {
    expect(promoAllowed('bonus_sessions', 'month')).toBe(false)
    expect(promoAllowed('bonus_sessions', 'session')).toBe(true)
    expect(promoAllowed('bonus_months', 'session')).toBe(false)
    expect(promoAllowed('bonus_days', 'session')).toBe(false)
    expect(promoAllowed('bonus_days', 'month')).toBe(true)
    expect(promoAllowed('percent', 'session')).toBe(true)
    expect(promoAllowed('', 'session')).toBe(true)
  })
})

describe('priceHint', () => {
  it('matches the reference text', () => {
    expect(priceHint(m700, quote(m700, null, 0, '2026-11-12'))).toBe('Giá gói 700.000 ₫. Hiệu lực 30 ngày. Nhập số nhỏ hơn thành tiền để ghi nhận còn nợ.')
  })
  it('mentions sessions and the promo price', () => {
    expect(priceHint(pt, quote(pt, { type: 'bonus_sessions', value: 2 }, 0, '2026-11-12'))).toContain('Hiệu lực 14 buổi')
    expect(priceHint(m700, quote(m700, { type: 'percent', value: 10 }, 0, '2026-11-12'))).toContain('sau khuyến mãi 630.000 ₫')
  })
})

describe('defaultStart', () => {
  const today = '2026-11-12'
  it('is today for a new member or a lapsed contract', () => {
    expect(defaultStart(null, today)).toBe(today)
    expect(defaultStart({ current_contract: null }, today)).toBe(today)
    expect(defaultStart({ current_contract: cc({ end_date: '2026-11-01' }) }, today)).toBe(today)
  })
  it('is the day after the current contract end when it has not ended', () => {
    expect(defaultStart({ current_contract: cc({ end_date: '2026-11-20' }) }, today)).toBe('2026-11-21')
    expect(defaultStart({ current_contract: cc({ end_date: today }) }, today)).toBe('2026-11-13')
    expect(defaultStart({ current_contract: cc({ end_date: '2026-12-31' }) }, today)).toBe('2027-01-01')
  })
})

describe('renewal', () => {
  it('links to active, expired or frozen contracts only', () => {
    expect(renewedFromId({ current_contract: cc({ status: 'active' }) })).toBe('c1')
    expect(renewedFromId({ current_contract: cc({ status: 'expired' }) })).toBe('c1')
    expect(renewedFromId({ current_contract: cc({ status: 'frozen' }) })).toBe('c1')
    expect(renewedFromId({ current_contract: cc({ status: 'draft' }) })).toBeNull()
    expect(renewedFromId({ current_contract: null })).toBeNull()
  })
  it('banner text for existing and first contract', () => {
    expect(memberBanner({ name: 'Hồ Nguyễn Đình Văn', code: 'HV0691', current_contract: cc({}) })).toBe('Hợp đồng mới cho hội viên Hồ Nguyễn Đình Văn (HV0691). Hợp đồng này được tính là gia hạn.')
    expect(memberBanner({ name: 'An', code: 'HV1', current_contract: null })).toBe('Hợp đồng đầu tiên của hội viên An (HV1).')
  })
})
