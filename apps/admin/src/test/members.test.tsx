import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { DataTable } from '../components/DataTable'
import { HsdCell, PtCell, PtEligibilityPanel, memberColumns, membersCsvRows, showBranchColumn } from '../pages/Members'
import type { Branch, Member, PtContract, PtEligibility } from '../types'

const eligibility = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../lib/api', () => ({
  api: { get: vi.fn(async () => ({ data: { data: eligibility.current } })) },
}))

const B1: Branch = { id: 'b1', code: 'Q2', name: 'Chi nhánh Quận 2' }
const B2: Branch = { id: 'b2', code: 'Q7', name: 'Chi nhánh Quận 7' }

const pt = (over: Partial<PtContract> = {}): PtContract => ({
  id: 'c9', code: 'HD00009', status: 'active', package_name: 'Gói 12 buổi PT', package_category: 'pt_1on1', start_date: '2026-08-01', end_date: '2026-11-01',
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
    expect(headers()).toEqual(['Mã', 'Thông tin khách hàng', 'Gói tập', 'Trạng thái', 'Chi nhánh', 'Ngày đăng ký', 'Hết hạn', 'HSD', 'Công nợ'])
  })
  it('single branch: Chi nhánh column is hidden, Ngày đăng ký sits next to Hết hạn', () => {
    table(memberColumns(false, branchOf), [member()])
    const h = headers()
    expect(h).toEqual(['Mã', 'Thông tin khách hàng', 'Gói tập', 'Trạng thái', 'Ngày đăng ký', 'Hết hạn', 'HSD', 'Công nợ'])
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
  it('shows name and sessions, never a second "Hết hạn" label (no HSD)', () => {
    const { container } = render(<PtCell m={member({ pt_contract: pt() })} />)
    const t = container.textContent ?? ''
    expect(t).toContain('Gói 12 buổi PT')
    expect(t).toContain('5/12 buổi')
    expect(t).not.toContain('Hết hạn')
    expect(t).not.toMatch(/HSD|Hạn sử dụng/)
  })
  it('escapes user text', () => {
    const { container } = render(<PtCell m={member({ pt_contract: pt({ package_name: '<img src=x onerror=alert(1)>' }) })} />)
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('HsdCell', () => {
  it('pt_1on1: date and green chip', () => {
    const { container } = render(<HsdCell m={member({ pt_contract: pt() })} />)
    expect(container.textContent).toContain('01/02/2027')
    expect(screen.getByText('Còn HSD').className).toContain('pill-ok')
  })
  it('pt_1on1 past: red chip; null deadline: Không giới hạn', () => {
    const { container } = render(<HsdCell m={member({ pt_contract: pt({ usage_valid: false, usage_deadline: null }) })} />)
    expect(screen.getByText('Quá HSD').className).toContain('pill-bad')
    expect(container.textContent).toContain('không giới hạn')
  })
  it('pt_1on2, pt_group and no PT show a dash', () => {
    expect(render(<HsdCell m={member({ pt_contract: pt({ package_category: 'pt_1on2' }) })} />).container.textContent).toBe('-')
    cleanup()
    expect(render(<HsdCell m={member({ pt_contract: pt({ package_category: 'pt_group', usage_deadline: null }) })} />).container.textContent).toBe('-')
    cleanup()
    expect(render(<HsdCell m={member()} />).container.textContent).toBe('-')
  })
  it('CSV has separate HSD columns, empty for non 1:1', () => {
    const r1 = membersCsvRows([member({ pt_contract: pt() })], false, () => undefined)
    expect(r1[0].slice(-2)).toEqual(['HSD', 'Tình trạng HSD'])
    expect(r1[1].slice(-2)).toEqual(['01/02/2027', 'Còn HSD'])
    expect(membersCsvRows([member({ pt_contract: pt({ package_category: 'pt_group' }) })], false, () => undefined)[1].slice(-2)).toEqual(['', ''])
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
  it('1:2 / group: no HSD wording, uses end date and PT_PACKAGE_EXPIRED', async () => {
    eligibility.current = {
      eligible: false, reasons: ['PT_PACKAGE_EXPIRED'],
      member_package: { ok: true, contract_code: 'HD00001', end_date: '2027-12-31' },
      pt_package: { category: 'pt_1on2', ok: false, contract_code: 'HD00009', end_date: '2026-01-01', usage_deadline: null, sessions_left: 3 },
    } satisfies PtEligibility
    render(<PtEligibilityPanel memberId="m4" />)
    await waitFor(() => expect(screen.getByText('Gói PT đã hết hạn')).toBeTruthy())
    expect(screen.getByText('Gói PT còn hạn')).toBeTruthy()
    expect(screen.queryByText('Gói PT còn trong hạn sử dụng')).toBeNull()
    expect(screen.getByText(/hết hạn 01.01.2026, còn 3 buổi/)).toBeTruthy()
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
    const inWindow = withPt.find((m) => m.pt_contract!.package_category === 'pt_1on1' && m.pt_contract!.end_date! < today && m.pt_contract!.usage_valid && m.current_contract?.status === 'active' && (m.current_contract.end_date ?? '') >= today)
    const pastWindow = withPt.find((m) => m.pt_contract!.package_category === 'pt_1on1' && !m.pt_contract!.usage_valid && m.current_contract?.status === 'active')
    const memberExpired = withPt.find((m) => m.pt_contract!.package_category === 'pt_1on1' && m.pt_contract!.usage_valid && m.current_contract?.status === 'expired')
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
  it('1:2 / group have no usage deadline and expire with the PT contract', async () => {
    const { data } = await http.get('/members', { params: { limit: 100 } })
    const others = (data.data as Member[]).filter((m) => m.pt_contract && m.pt_contract.package_category !== 'pt_1on1')
    expect(others.length).toBeGreaterThan(0)
    others.forEach((m) => expect(m.pt_contract!.usage_deadline).toBeNull())
    const lapsed = others.find((m) => !m.pt_contract!.usage_valid && m.current_contract?.status === 'active')
    if (lapsed) expect((await http.get('/members/' + lapsed.id + '/pt-eligibility')).data.data.reasons).toEqual(['PT_PACKAGE_EXPIRED'])
  })
  it('PT package never counts as the member package', async () => {
    const { data } = await http.get('/members', { params: { limit: 100 } })
    for (const m of data.data as Member[]) expect(m.current_contract?.package_name ?? '').not.toMatch(/^PT /)
  })
})
