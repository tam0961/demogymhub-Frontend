import { describe, expect, it } from 'vitest'
import { POSITION_LABEL, TAX_MODE_LABEL, appliesTo, bandLabel, computeSim, currentMonth, grossOf, insuranceParts, millions, netOf, pct, progressiveLabel, ptSplit, tierLine } from '../lib/payroll'

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

describe('simulator mirrors backend computeRow (golden cases from demogymhub-Backend tests/payroll.test.ts)', () => {
  const settings = {
    memberTiers: [{ upTo: 15_000_000, rate: 1.5 }, { upTo: 25_000_000, rate: 2.5 }, { upTo: 35_000_000, rate: 3.5 }, { upTo: null, rate: 4.5 }],
    ptTiers: [{ upTo: 30_000_000, rate: 25 }, { upTo: 50_000_000, rate: 27 }, { upTo: 65_000_000, rate: 30 }, { upTo: null, rate: 35 }],
    marketingTiers: [{ upTo: 129_000_000, rate: 1.5 }, { upTo: 179_000_000, rate: 3 }, { upTo: null, rate: 4 }],
    ptImmediateShare: 0.4, ptSessionShare: 0.6, classRate: 100_000, insuranceRate: 10.5, insuranceBase: 5_500_000 as number | null, fixedTax: 0,
    partTimeTaxRate: 10, taxBrackets: [], personalDeduction: null, dependentDeduction: null,
  }
  const base = { baseSalary: 0, memberSales: 0, gymMemberTotal: 0, ptSales: 0, ptTotalSessions: 0, ptSessionsTaught: 0, groupClasses: 0, penalty: 0 }
  const pick = (r: ReturnType<typeof computeSim>) => [r.gross, r.insurance, r.tax, r.net]

  it('PT fulltime', () => {
    const r = computeSim({ ...base, position: 'pt_fulltime', baseSalary: 5_500_000, memberSales: 20_000_000, ptSales: 35_000_000, ptTotalSessions: 10, ptSessionsTaught: 4, groupClasses: 3, penalty: 100_000 }, settings)
    expect(pick(r)).toEqual([12_198_000, 577_500, 0, 11_520_500])
  })
  it('PT parttime: no insurance, 10% of gross', () => {
    const r = computeSim({ ...base, position: 'pt_parttime', baseSalary: 3_000_000, memberSales: 4_000_000, ptSales: 20_000_000, ptTotalSessions: 8, ptSessionsTaught: 6, groupClasses: 5 }, settings)
    expect(pick(r)).toEqual([7_810_000, 0, 781_000, 7_029_000])
  })
  it('marketing: tiers on the whole gym, no sessions or classes', () => {
    const r = computeSim({ ...base, position: 'marketing', baseSalary: 8_000_000, memberSales: 31_000_000, gymMemberTotal: 200_000_000, ptSales: 5_000_000, ptSessionsTaught: 3, groupClasses: 4, penalty: 50_000 }, settings)
    expect(pick(r)).toEqual([13_460_000, 577_500, 0, 12_832_500])
    expect(r.ptSessionPay + r.groupPay).toBe(0)
  })
  it('applies by position and labels bands', () => {
    expect(appliesTo('marketing')).toMatchObject({ marketingTiers: true, ptSession: false, groupClass: false })
    expect(appliesTo('pt_parttime')).toMatchObject({ insurance: false, flatTax: true })
    expect(progressiveLabel(settings.memberTiers, 1)).toBe('> 15 – 25 triệu')
    expect(bandLabel(settings.ptTiers, 0)).toBe('Dưới 30 triệu')
    expect(insuranceParts(5_500_000, 10.5).map((p) => p.amount)).toEqual([440_000, 55_000, 82_500])
  })
})
