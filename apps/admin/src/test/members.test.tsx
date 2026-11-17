import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { DataTable } from '../components/DataTable'
import { PtCell, PtEligibilityPanel, memberColumns, membersCsvRows, showBranchColumn } from '../pages/Members'
import type { Branch, Member, PtContract, PtEligibility } from '../types'

const eligibility = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(async () => ({ data: { data: eligibility.current } })) },
}))

const B1: Branch = { id: 'b1', code: 'Q2', name: 'Chi nhánh Quận 2' }
const B2: Branch = { id: 'b2', code: 'Q7', name: 'Chi nhánh Quận 7' }

const pt = (over: Partial<PtContract> = {}): PtContract => ({
  id: 'c9', code: 'HD00009', status: 'active', package_name: 'Gói 12 buổi PT', start_date: '2026-08-01', end_date: '2026-11-01',
  sessions_total: 12, sessions_left: 5, usage_deadline: '2027-02-01', usage_valid: true, ...over,
})
const member = (over: Partial<Member> = {}): Member => ({
  id: 'm1', code: 'HV0001', name: 'Nguyễn Văn An', phone: '0901234567', email: null, gender: 'male', dob: null, status: 'active', branch_id: 'b1',
  avatar_url: null, created_at: '2026-01-05T00:00:00.000Z', branch: B1,
  current_contract: { id: 'c1', code: 'HD00001', status: 'active', package_name: 'Gói 3 tháng', package_type: 'month', start_date: '2026-10-01', end_date: '2027-12-31', sessions_left: null },
  pt_contract: null, ...over,
})

const headers = () => screen.getAllByRole('columnheader').map((h) => (h.textContent ?? '').replace(/[↕↑↓▲▼]/g, '').trim()).filter(Boolean)
const table = (cols: ReturnType<typeof memberColumns>, rows: Member[]) =>
  render(<MemoryRouter><DataTable columns={cols} rows={rows} rowKey={(m) => m.id} /></MemoryRouter>)

afterEach(cleanup)

describe('showBranchColumn', () => {
  it('hides for single-branch users and for a selected branch, shows for all-branches multi-branch', () => {
    expect(showBranchColumn({ branches: [B1] }, null)).toBe(false)
    expect(showBranchColumn({ branches: [B1, B2] }, 'b1')).toBe(false)
    expect(showBranchColumn({ branches: [B1, B2] }, null)).toBe(true)
    expect(showBranchColumn(null, null)).toBe(false)
  })
})

describe('Members columns', () => {
  const branchOf = (m: Member) => m.branch ?? undefined
  it('all branches: Chi nhánh column is shown and order is correct', () => {
    table(memberColumns(true, branchOf), [member()])
    expect(headers()).toEqual(['Mã', 'Thông tin khách hàng', 'Trạng thái', 'Chi nhánh', 'Gói hiện tại', 'Ngày đăng ký', 'Hết hạn', 'Gói PT'])
  })
  it('single branch: Chi nhánh column is hidden, Ngày đăng ký sits next to Hết hạn', () => {
    table(memberColumns(false, branchOf), [member()])
    const h = headers()
    expect(h).toEqual(['Mã', 'Thông tin khách hàng', 'Trạng thái', 'Gói hiện tại', 'Ngày đăng ký', 'Hết hạn', 'Gói PT'])
    expect(h.indexOf('Hết hạn') - h.indexOf('Ngày đăng ký')).toBe(1)
  })
  it('CSV follows the visible columns', () => {
    const rows = [member({ pt_contract: pt() })]
    const withB = membersCsvRows(rows, true, (m) => m.branch ?? undefined)
    const noB = membersCsvRows(rows, false, (m) => m.branch ?? undefined)
    expect(withB[0]).toContain('Chi nhánh')
    expect(noB[0]).not.toContain('Chi nhánh')
    expect(noB[0].length).toBe(withB[0].length - 1)
    expect(noB[1].length).toBe(noB[0].length)
    expect(noB[1]).toContain('5/12')
  })
})

describe('PtCell', () => {
  it('shows a dash without a PT package', () => {
    const { container } = render(<PtCell m={member()} />)
    expect(container.textContent).toBe('-')
  })
  it('valid: name, sessions, end date, usage deadline and green chip', () => {
    const { container } = render(<PtCell m={member({ pt_contract: pt() })} />)
    const t = container.textContent ?? ''
    expect(t).toContain('Gói 12 buổi PT')
    expect(t).toContain('5/12 buổi')
    expect(t).toContain('Hết hạn 01/11/2026')
    expect(t).toContain('Hạn sử dụng đến 01/02/2027')
    expect(screen.getByText('Còn hạn sử dụng').className).toContain('pill-ok')
    expect(screen.queryByText('Quá hạn sử dụng')).toBeNull()
  })
  it('past window: red chip', () => {
    render(<PtCell m={member({ pt_contract: pt({ usage_valid: false, usage_deadline: '2026-05-01' }) })} />)
    expect(screen.getByText('Quá hạn sử dụng').className).toContain('pill-bad')
  })
  it('null usage deadline shows Không giới hạn', () => {
    const { container } = render(<PtCell m={member({ pt_contract: pt({ usage_deadline: null }) })} />)
    expect(container.textContent).toContain('Không giới hạn')
  })
  it('escapes user text', () => {
    const { container } = render(<PtCell m={member({ pt_contract: pt({ package_name: '<img src=x onerror=alert(1)>' }) })} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('PtEligibilityPanel', () => {
  const ok: PtEligibility = {
    eligible: true, reasons: [],
    member_package: { ok: true, contract_code: 'HD00001', end_date: '2027-12-31' },
    pt_package: { ok: true, contract_code: 'HD00009', end_date: '2026-11-01', usage_deadline: '2027-02-01', sessions_left: 5 },
  }
  it('eligible state', async () => {
    eligibility.current = ok
    render(<PtEligibilityPanel memberId="m1" />)
    await waitFor(() => expect(screen.getByText('Đủ điều kiện')).toBeTruthy())
    expect(screen.getByText('Gói member còn hạn')).toBeTruthy()
    expect(screen.getByText('Gói PT còn trong hạn sử dụng')).toBeTruthy()
    expect(screen.getByText(/Khách vẫn check-in vào phòng tập theo gói member/)).toBeTruthy()
    expect(screen.getByText(/hạn sử dụng đến 01\/02\/2027, còn 5 buổi/)).toBeTruthy()
  })
  it('not eligible: reasons mapped to Vietnamese', async () => {
    eligibility.current = {
      eligible: false, reasons: ['MEMBER_PACKAGE_EXPIRED', 'PT_USAGE_EXPIRED'],
      member_package: { ok: false, contract_code: 'HD00001', end_date: '2026-01-01' },
      pt_package: { ok: false, contract_code: 'HD00009', end_date: '2026-01-01', usage_deadline: '2026-04-01', sessions_left: 3 },
    } satisfies PtEligibility
    render(<PtEligibilityPanel memberId="m2" />)
    await waitFor(() => expect(screen.getByText('Chưa đủ điều kiện')).toBeTruthy())
    expect(screen.getByText('Gói member đã hết hạn')).toBeTruthy()
    expect(screen.getByText('Đã quá hạn sử dụng gói PT')).toBeTruthy()
    expect(screen.getAllByText('Không đạt')).toHaveLength(2)
  })
  it('no PT package', async () => {
    eligibility.current = {
      eligible: false, reasons: ['NO_PT_PACKAGE'],
      member_package: { ok: true, contract_code: 'HD00001', end_date: '2027-12-31' },
      pt_package: { ok: false, contract_code: null, end_date: null, usage_deadline: null, sessions_left: null },
    } satisfies PtEligibility
    render(<PtEligibilityPanel memberId="m3" />)
    await waitFor(() => expect(screen.getByText('Chưa có gói PT', { selector: 'li' })).toBeTruthy())
    const panel = screen.getByRole('region', { name: 'Điều kiện xếp lịch PT' })
    expect(within(panel).getByText('Chưa đủ điều kiện')).toBeTruthy()
  })
})

describe('mock adapter: PT eligibility rules', () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  beforeEach(async () => {
    await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
  })
  it('covers eligible, in-window past end, past window and expired member package', async () => {
    const { data } = await http.get('/members', { params: { limit: 100 } })
    const list = data.data as Member[]
    const withPt = list.filter((m) => m.pt_contract)
    expect(withPt.length).toBeGreaterThan(10)
    const today = new Date().toISOString().slice(0, 10)
    const inWindow = withPt.find((m) => m.pt_contract!.end_date! < today && m.pt_contract!.usage_valid && m.current_contract?.status === 'active' && (m.current_contract.end_date ?? '') >= today)
    const pastWindow = withPt.find((m) => !m.pt_contract!.usage_valid && m.current_contract?.status === 'active')
    const memberExpired = withPt.find((m) => m.pt_contract!.usage_valid && m.current_contract?.status === 'expired')
    expect(inWindow && pastWindow && memberExpired).toBeTruthy()
    const get = async (id: string) => (await http.get(`/members/${id}/pt-eligibility`)).data.data as PtEligibility
    const e1 = await get(inWindow!.id)
    expect(e1.eligible).toBe(true)
    const e2 = await get(pastWindow!.id)
    expect(e2.eligible).toBe(false)
    expect(e2.reasons).toEqual(['PT_USAGE_EXPIRED'])
    const e3 = await get(memberExpired!.id)
    expect(e3.reasons).toContain('MEMBER_PACKAGE_EXPIRED')
    expect(e3.eligible).toBe(false)
  })
  it('PT package never counts as the member package', async () => {
    const { data } = await http.get('/members', { params: { limit: 100 } })
    for (const m of data.data as Member[]) expect(m.current_contract?.package_name ?? '').not.toMatch(/PT/)
  })
})
