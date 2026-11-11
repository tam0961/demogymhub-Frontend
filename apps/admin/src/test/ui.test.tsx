import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { daysLeft, daysLeftText, fmtDate, fmtMoney, initials, memberStatus, packageKind } from '../lib/format'
import { buildTasks } from '../lib/tasks'
import { DataTable, pageButtons, paginate, sortRows, type Column } from '../components/DataTable'
import type { TodayTasks } from '../types'

const T = '2026-11-11'
afterEach(cleanup)

describe('memberStatus', () => {
  it('maps contract to label and tone', () => {
    expect(memberStatus(null, T)).toEqual({ label: 'Chưa kích hoạt', tone: 'neutral' })
    expect(memberStatus({ status: 'active', end_date: '2027-03-01' }, T)).toEqual({ label: 'Còn hạn', tone: 'ok' })
    expect(memberStatus({ status: 'active', end_date: '2026-11-18' }, T)).toEqual({ label: 'Sắp hết hạn', tone: 'warn' })
    expect(memberStatus({ status: 'active', end_date: '2026-11-19' }, T).label).toBe('Còn hạn')
    expect(memberStatus({ status: 'active', end_date: '2026-11-10' }, T)).toEqual({ label: 'Hết hạn', tone: 'bad' })
    expect(memberStatus({ status: 'expired', end_date: null }, T).tone).toBe('bad')
    expect(memberStatus({ status: 'frozen' }, T).label).toBe('Bảo lưu')
    expect(memberStatus({ status: 'signed' }, T).label).toBe('Chưa kích hoạt')
    expect(memberStatus({ status: 'draft' }, T)).toEqual({ label: 'Chờ ký', tone: 'warn' })
    expect(memberStatus({ status: 'cancelled' }, T)).toEqual({ label: 'Đã hủy', tone: 'bad' })
  })
})

describe('format helpers', () => {
  it('money and date', () => {
    expect(fmtMoney(700000)).toBe('700.000 ₫')
    expect(fmtDate('2026-09-13')).toBe('13/09/2026')
    expect(fmtDate('2026-09-13T10:00:00Z')).toMatch(/^\d{2}\/\d{2}\/2026$/)
    expect(fmtDate(null)).toBe('-')
  })
  it('days left text', () => {
    expect(daysLeft('2026-11-12', T)).toBe(1)
    expect(daysLeftText('2026-11-12', T)).toBe('Còn 1 ngày')
    expect(daysLeftText('2026-11-11', T)).toBe('Hết hạn hôm nay')
    expect(daysLeftText('2026-11-08', T)).toBe('Quá hạn 3 ngày')
    expect(daysLeftText(null, T)).toBe('')
  })
  it('initials and package kind', () => {
    expect(initials('Chủ Thử')).toBe('CT')
    expect(initials('Nguyễn Minh Khoa')).toBe('NK')
    expect(packageKind('month')).toBe('Gym')
    expect(packageKind('session')).toBe('PT')
    expect(packageKind('day')).toBe('Lớp')
    expect(packageKind('month', 'Combo 3 tháng')).toBe('Combo')
  })
})

interface Row { id: string; name: string; n: number | null }
const cols: Column<Row>[] = [
  { key: 'name', header: 'Tên', sortValue: (r) => r.name, render: (r) => r.name },
  { key: 'n', header: 'Số', numeric: true, sortValue: (r) => r.n, render: (r) => String(r.n ?? '') },
]
const data: Row[] = Array.from({ length: 120 }, (_, i) => ({ id: `r${i}`, name: `Hội viên ${i + 1}`, n: i % 10 === 0 ? null : 120 - i }))

describe('DataTable helpers', () => {
  it('sortRows sorts numbers with nulls last, strings naturally', () => {
    const asc = sortRows(data, cols[1], 'asc')
    expect(asc[0].n).toBe(1)
    expect(asc[asc.length - 1].n).toBeNull()
    const desc = sortRows(data, cols[1], 'desc')
    expect(desc[0].n).toBe(119)
    expect(sortRows(data, cols[0], 'asc')[1].name).toBe('Hội viên 2')
  })
  it('paginate and pageButtons', () => {
    expect(paginate(data, 2, 50)).toHaveLength(50)
    expect(paginate(data, 3, 50)).toHaveLength(20)
    expect(pageButtons(1, 2)).toEqual([1, 2])
    expect(pageButtons(5, 10)).toEqual([1, 4, 5, 6, 10])
  })
})

describe('DataTable', () => {
  it('renders page 1 of 50, footer range and navigates', () => {
    render(<DataTable columns={cols} rows={data} rowKey={(r) => r.id} itemLabel="hội viên" />)
    expect(screen.getByText('1-50 / 120')).toBeTruthy()
    expect(screen.getAllByRole('row')).toHaveLength(51)
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(screen.getByText('51-100 / 120')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Trang cuối' }))
    expect(screen.getByText('101-120 / 120')).toBeTruthy()
  })
  it('sorts when a header is clicked and handles row click', () => {
    let clicked = ''
    render(<DataTable columns={cols} rows={data.slice(0, 5)} rowKey={(r) => r.id} onRowClick={(r) => (clicked = r.id)} />)
    fireEvent.click(screen.getByRole('button', { name: /Tên/ }))
    fireEvent.click(screen.getByRole('button', { name: /Tên/ }))
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('Hội viên 5')).toBeTruthy()
    fireEvent.click(rows[1])
    expect(clicked).toBe('r4')
  })
  it('supports selection', () => {
    let sel: string[] = []
    const { rerender } = render(<DataTable columns={cols} rows={data.slice(0, 3)} rowKey={(r) => r.id} selectable selected={sel} onSelectionChange={(k) => (sel = k)} />)
    fireEvent.click(screen.getByLabelText('Chọn tất cả'))
    expect(sel).toEqual(['r0', 'r1', 'r2'])
    rerender(<DataTable columns={cols} rows={data.slice(0, 3)} rowKey={(r) => r.id} selectable selected={sel} onSelectionChange={(k) => (sel = k)} />)
    fireEvent.click(screen.getByLabelText('Chọn tất cả'))
    expect(sel).toEqual([])
  })
})

describe('buildTasks', () => {
  const t: TodayTasks = {
    awaiting_signature: { count: 2, items: [{ id: 'a', code: 'HD1', member_name: 'An' }, { id: 'b', code: 'HD2', member_name: 'Bình' }] },
    unpaid: { count: 1, total_debt: 3954000, items: [{ id: 'c', code: 'HD3', member_name: 'Cường', debt_amount: 3954000 }] },
    expiring_in_2_days: { count: 0, items: [] },
    pending_refunds: { count: 1, items: [{ id: 'p', contract_code: 'HD4', amount: 200000 }] },
  }
  it('numbers rows, skips empty groups, maps tone and target', () => {
    const rows = buildTasks(t)
    expect(rows.map((r) => [r.rank, r.key, r.tone])).toEqual([[1, 'sign', 'warn'], [2, 'unpaid', 'bad'], [3, 'refund', 'yellow']])
    expect(rows[0].title).toBe('2 hợp đồng chờ khách ký')
    expect(rows[0].detail).toBe('An, Bình')
    expect(rows[0].to).toBe('/contracts')
    expect(rows[1].to).toBe('/debt')
    expect(rows[1].detail).toContain('3.954.000 ₫')
    expect(buildTasks(null)).toEqual([])
  })
  it('single awaiting contract opens it directly', () => {
    const one = buildTasks({ ...t, awaiting_signature: { count: 1, items: [{ id: 'z', code: 'HD9', member_name: 'Zed' }] } })
    expect(one[0].to).toBe('/contracts/z')
  })
})
