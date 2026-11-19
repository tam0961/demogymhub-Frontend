import { describe, expect, it } from 'vitest'
import { POSITION_LABEL, TAX_MODE_LABEL, currentMonth, grossOf, millions, netOf, pct, ptSplit, tierLine } from '../lib/payroll'

const member = [{ upTo: 15_000_000, rate: 1.5 }, { upTo: 25_000_000, rate: 2.5 }, { upTo: null, rate: 4.5 }]

describe('payroll helpers', () => {
  it('formats tier lines in millions with Vietnamese decimals', () => {
    expect(tierLine(member, 0)).toBe('0 ₫ - 15 triệu: 1,5%')
    expect(tierLine(member, 1)).toBe('15 triệu - 25 triệu: 2,5%')
    expect(tierLine(member, 2)).toBe('Trên 25 triệu: 4,5%')
    expect(tierLine(member, 9)).toBe('')
  })

  it('formats millions and percents', () => {
    expect(millions(1_500_000)).toBe('1,5 triệu')
    expect(millions(500_000)).toBe('500.000 ₫')
    expect(pct(10.5)).toBe('10,5%')
  })

  it('splits the PT rate into the immediate and the per-session share', () => {
    const s = ptSplit(25, 0.4, 0.6)
    expect(s.immediate).toBeCloseTo(10)
    expect(s.session).toBeCloseTo(15)
  })

  it('labels positions and tax modes and builds the current month key', () => {
    expect(POSITION_LABEL.pt_parttime).toBe('PT Parttime')
    expect(TAX_MODE_LABEL.flat10).toBe('10% tổng thu nhập')
    expect(currentMonth(new Date(2026, 10, 19))).toBe('2026-11')
    expect(currentMonth(new Date(2026, 0, 5))).toBe('2026-01')
  })

  it('computes gross and net from the components', () => {
    const r = { base_salary: 8_000_000, member_commission: 500_000, marketing_commission: 0, pt_immediate: 1_000_000, pt_session_pay: 600_000, group_pay: 200_000 }
    expect(grossOf(r)).toBe(10_300_000)
    expect(netOf({ gross: 10_300_000, insurance: 840_000, tax: 0, penalty: 100_000, adjustment: -50_000 })).toBe(9_310_000)
  })
})
