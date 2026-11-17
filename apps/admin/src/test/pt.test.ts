import { describe, expect, it } from 'vitest'
import { addMonths, isLateCancel, ptUsageDeadline, ptUsageMonths } from '../lib/pt'

describe('addMonths', () => {
  it('adds months and clamps to month end', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15')
    expect(addMonths('2026-03-31', 6)).toBe('2026-09-30')
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28')
  })
})

describe('ptUsageDeadline', () => {
  it('uses 3 months up to 30 sessions and 6 months above', () => {
    expect(ptUsageMonths(30)).toBe(3)
    expect(ptUsageMonths(31)).toBe(6)
    expect(ptUsageDeadline('2026-11-30', 12)).toBe('2027-02-28')
    expect(ptUsageDeadline('2026-11-30', 30)).toBe('2027-02-28')
    expect(ptUsageDeadline('2026-11-30', 31)).toBe('2027-05-30')
    expect(ptUsageDeadline('2026-08-31', 50)).toBe('2027-02-28')
  })
  it('returns null without an end date', () => {
    expect(ptUsageDeadline(null, 12)).toBeNull()
  })
})

describe('isLateCancel', () => {
  const now = Date.parse('2026-11-17T10:00:00Z')
  it('is free at 90 minutes or more, late below', () => {
    expect(isLateCancel('2026-11-17T11:30:00Z', now)).toBe(false)
    expect(isLateCancel('2026-11-17T11:29:00Z', now)).toBe(true)
    expect(isLateCancel('2026-11-17T09:00:00Z', now)).toBe(true)
  })
})
