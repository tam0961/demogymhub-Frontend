import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthContext } from '../context/AuthContext'
import { BranchTag, branchColor } from '../components/ui'
import { roleLabelOf } from '../components/Layout'
import type { Branch, Me } from '../types'

const stats = {
  date: '2026-11-11',
  branches: [{ branch: { id: 'b1', code: 'Q2', name: 'Chi nhánh Quận 2' }, checkins_today: 4, denied_today: 1, inside_now: 2, by_hour: [{ hour: 9, count: 3 }] }],
  totals: { checkins_today: 4, denied_today: 1, inside_now: 2 },
}
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url === '/reports/checkin-stats') return { data: { data: stats } }
      if (url === '/checkins/live') return { data: { data: { count: 0, items: [] } } }
      if (url === '/checkins') return { data: { data: [], meta: { page: 1, limit: 12, total: 0 } } }
      return { data: { data: null } }
    }),
    post: vi.fn(),
  },
}))

const Q7: Branch = { id: 'b7', code: 'Q7', name: 'Chi nhánh Quận 7' }
const base = { id: '1', email: 'a@b.c', name: 'A', permissions: ['checkins.read', 'checkins.create', 'checkins.override', 'contracts.read', 'reports.view'] }
const owner: Me = { ...base, roles: ['super_admin'], branches: [Q7], can_checkin: false, checkin_branch: null }
const lt: Me = { ...base, roles: ['receptionist'], branches: [Q7], can_checkin: true, checkin_branch: Q7 }

const wrap = (user: Me, ui: ReactNode) =>
  render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user, ready: true, login: async () => {}, logout: async () => {} }}>{ui}</AuthContext.Provider>
    </MemoryRouter>,
  )

afterEach(cleanup)

describe('Today gating', async () => {
  const { default: Today } = await import('../pages/Today')
  it('owner: no check-in input, shows view-only banner and stats', async () => {
    wrap(owner, <Today />)
    expect(screen.queryByPlaceholderText(/số điện thoại hoặc mã hội viên/i)).toBeNull()
    expect(screen.getByText(/Chế độ xem thống kê/)).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Thống kê Chi nhánh Quận 2')).toBeTruthy())
  })
  it('receptionist: input, static branch label, no select', () => {
    wrap(lt, <Today />)
    expect(screen.getByPlaceholderText(/số điện thoại hoặc mã hội viên/i)).toBeTruthy()
    expect(screen.getByText('Check-in tại')).toBeTruthy()
    expect(screen.getByText('Chi nhánh Quận 7')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('Access gating', async () => {
  const { default: Access } = await import('../pages/Access')
  it('owner: no manual box', () => {
    wrap(owner, <Access />)
    expect(screen.queryByLabelText('Mã hội viên hoặc số điện thoại')).toBeNull()
    expect(screen.getByRole('note')).toBeTruthy()
  })
  it('receptionist: manual box present', () => {
    wrap(lt, <Access />)
    expect(screen.getByLabelText('Mã hội viên hoặc số điện thoại')).toBeTruthy()
  })
})

describe('roles and branches', () => {
  it('role labels', () => {
    expect(roleLabelOf({ roles: ['super_admin'], branches: [], checkin_branch: null })).toBe('Chủ phòng gym')
    expect(roleLabelOf(lt)).toBe('Lễ tân Quận 7')
    expect(roleLabelOf({ roles: ['sales'], branches: [Q7] })).toBe('Sales')
    expect(roleLabelOf({ roles: ['trainer'], branches: [] })).toBe('PT')
    expect(roleLabelOf({ roles: ['accountant'], branches: [] })).toBe('Kế toán')
    expect(roleLabelOf({ roles: ['member'], branches: [] })).toBe('Hội viên')
  })
  it('branch colour for q2', () => {
    expect(branchColor('Q2')).toBe('q2')
    expect(branchColor('NB')).toBe('nb')
    expect(branchColor(null)).toBe('all')
    const { container } = render(<BranchTag branch={{ code: 'q2', name: 'Chi nhánh Quận 2' }} />)
    expect(container.querySelector('.tag-q2')).toBeTruthy()
  })
})
