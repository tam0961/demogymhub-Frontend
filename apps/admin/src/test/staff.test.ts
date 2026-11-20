import { describe, expect, it } from 'vitest'
import { delta, fmtRate, inGroup, isPt, monthLabel, monthShort, shiftMonth, staffCsv, staffTotals } from '../lib/staff'
import type { StaffRow } from '../types'

const row = (over: Partial<StaffRow> & { position: StaffRow['position'] }): StaffRow => ({
  user_id: 'u', name: 'A', phone: '0903', active: true, hired_on: null, left_on: null, note: null, employee_no: null,
  branches: [{ id: 'b', code: 'Q7', name: 'Chi nhánh Quận 7' }],
  kpi: { contracts_sold: 2, member_contracts: 1, pt_contracts: 1, new_customers: 1, revenue: 3_000_000, member_revenue: 1_000_000, pt_revenue: 2_000_000, avg_contract_value: 1_500_000, debt_outstanding: 0, active_clients: 4, sessions_taught: 10, group_classes: 2, session_done_rate: 0.9, no_show_rate: 0.05, sessions_left_total: 20, expiring_30: 1, renewal_rate: null },
  prev: { contracts_sold: 1, revenue: 2_000_000, sessions_taught: 8, new_customers: 1 },
  rank: { revenue: 1 },
  ...over,
})

describe('staff helpers', () => {
  it('computes the change against the previous month', () => {
    expect(delta(150, 100)).toEqual({ text: '+50%', tone: 'ok' })
    expect(delta(80, 100)).toEqual({ text: '-20%', tone: 'bad' })
    expect(delta(100, 100)).toEqual({ text: '0%', tone: null })
    expect(delta(5, 0)).toEqual({ text: 'Mới', tone: 'ok' })
    expect(delta(0, 0)).toBeNull()
  })

  it('shifts and labels months', () => {
    expect(shiftMonth('2026-11', -1)).toBe('2026-10')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthLabel('2026-11')).toBe('Tháng 11/2026')
    expect(monthShort('2026-11')).toBe('11/26')
  })

  it('formats rates and groups positions', () => {
    expect(fmtRate(0.856)).toBe('86%')
    expect(fmtRate(null)).toBe('-')
    expect(isPt('pt_parttime')).toBe(true)
    expect(isPt('marketing')).toBe(false)
    expect(inGroup('marketing', 'sale')).toBe(true)
    expect(inGroup('reception', 'other')).toBe(true)
    expect(inGroup('pt_fulltime', 'sale')).toBe(false)
  })

  it('totals the month and the previous month', () => {
    const t = staffTotals([row({ position: 'pt_fulltime' }), row({ position: 'sale' })])
    expect(t).toMatchObject({ contracts: 4, revenue: 6_000_000, customers: 2, sessions: 20, pContracts: 2, pRevenue: 4_000_000 })
  })

  it('exports PT columns only for PT rows', () => {
    const csv = staffCsv([row({ position: 'pt_fulltime', name: 'Khánh' }), row({ position: 'sale', name: 'Tâm' })])
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Khách đang phụ trách')
    expect(lines[1]).toContain('Khánh,0903,PT Fulltime,Chi nhánh Quận 7,2,1,3000000,2000000,1,4,10,90%')
    expect(lines[2]).toContain('Tâm,0903,Sale,Chi nhánh Quận 7,2,1,3000000,2000000,1,,,,,,')
  })
})
