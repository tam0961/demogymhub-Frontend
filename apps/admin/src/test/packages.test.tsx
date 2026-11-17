import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { groupPackages, changedFields, termText } from '../lib/packages'
import type { Pkg } from '../types'

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('../lib/api', () => ({ api: h }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { branches: [{ id: 'b1', code: 'NB', name: 'Nhà Bè' }] } }) }))
vi.mock('../context/BranchContext', () => ({ useBranch: () => ({ branchId: 'b1' }) }))
vi.mock('../context/usePermission', () => ({ usePermission: () => ({ can: () => true }), RequirePermission: ({ children }: { children: unknown }) => children }))

import Packages, { PackageModal } from '../pages/Packages'
import { BundleInfo } from '../pages/ContractNew'
import { BundleSection } from '../pages/ContractDetail'

const pkg = (over: Partial<Pkg>): Pkg => ({
  id: 'x', name: 'Gói', type: 'month', category: 'member', duration_days: 30, sessions: null, price: 600000, vat_percent: 8, branch_id: 'b1', active: true,
  bundled_member_package: null, replaces_id: null, contracts_count: 0, in_use: false, ...over,
})
const M = pkg({ id: 'm1', name: 'Gói 1 tháng' })
const LIST: Pkg[] = [
  M,
  pkg({ id: 'm2', name: 'Gói cũ', active: false }),
  pkg({ id: 'pt1', name: 'PT 10 buổi', category: 'pt_1on1', type: 'session', duration_days: null, sessions: 10, bundled_member_package: { id: 'm1', name: 'Gói 1 tháng', duration_days: 30, price: 600000 }, contracts_count: 3, in_use: true }),
  pkg({ id: 'pt2', name: 'PT chưa gắn', category: 'pt_1on2', type: 'session', duration_days: null, sessions: 12, replaces_id: 'old' }),
]

beforeEach(() => {
  h.get.mockReset().mockResolvedValue({ data: { data: LIST, meta: { page: 1, limit: 200, total: 4 } } })
  h.post.mockReset().mockResolvedValue({ data: { data: {} } })
  h.patch.mockReset().mockResolvedValue({ data: { data: {} } })
})
afterEach(cleanup)

const page = () => render(<ToastProvider><Packages /></ToastProvider>)

describe('package helpers', () => {
  it('groups by category in order and hides inactive by default', () => {
    expect(Object.keys(groupPackages(LIST, false))).toEqual(['member', 'pt_1on1', 'pt_1on2', 'pt_group'])
    expect(groupPackages(LIST, false).member.map((p) => p.id)).toEqual(['m1'])
    expect(groupPackages(LIST, true).member.map((p) => p.id)).toEqual(['m1', 'm2'])
  })
  it('term text and changed fields only', () => {
    expect(termText(pkg({ type: 'month', duration_days: 90 }))).toBe('3 tháng')
    expect(termText(pkg({ type: 'session', sessions: 10, duration_days: 60 }))).toBe('10 buổi, hết hạn sau 60 ngày')
    const f = { name: 'Gói 1 tháng', category: 'member' as const, type: 'month' as const, duration_days: 30, sessions: null, price: 700000, vat_percent: 8, bundled_member_package_id: '' }
    expect(changedFields(M, f)).toEqual({ price: 700000 })
  })
})

describe('Packages page', () => {
  it('renders 4 boxes in order with counts', async () => {
    page()
    await screen.findByText('PT 10 buổi')
    const heads = screen.getAllByRole('heading', { level: 2 }).map((x) => x.textContent)
    expect(heads).toEqual(['Gói member', 'PT 1:1', 'PT 1:2', 'PT nhóm'])
    expect(screen.getAllByRole('button', { name: 'Thêm gói' })).toHaveLength(4)
    expect(screen.getByText('Chưa gắn')).toBeTruthy()
    expect(screen.getByText('Phiên bản mới')).toBeTruthy()
  })
  it('inactive toggle shows muted packages', async () => {
    page()
    await screen.findByText('Gói 1 tháng')
    expect(screen.queryByText('Gói cũ')).toBeNull()
    fireEvent.click(screen.getByLabelText('Hiện gói đã vô hiệu hóa'))
    expect(screen.getByText('Gói cũ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kích hoạt lại' })).toBeTruthy()
  })
  it('Sửa is disabled only for packages in use', async () => {
    page()
    await screen.findByText('PT 10 buổi')
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement
    const used = within(rowOf('PT 10 buổi')).getByRole('button', { name: 'Sửa' }) as HTMLButtonElement
    expect(used.disabled).toBe(true)
    expect(used.title).toBe('Gói đã có hợp đồng, không sửa được. Hãy tạo phiên bản mới.')
    expect((within(rowOf('Gói 1 tháng')).getByRole('button', { name: 'Sửa' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('deactivate confirms then patches only active', async () => {
    page()
    await screen.findByText('Gói 1 tháng')
    const row = screen.getByText('Gói 1 tháng').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Vô hiệu hóa' }))
    expect(screen.getByText('Gói sẽ không hiện khi bán mới. Các hợp đồng đã bán giữ nguyên.')).toBeTruthy()
    const dlg = screen.getByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Vô hiệu hóa' }))
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith('/packages/m1', { active: false }))
  })
  it('new version posts replaces_id and deactivate_replaced', async () => {
    const onSaved = vi.fn()
    render(<ToastProvider><PackageModal target={{ mode: 'version', pkg: LIST[2] }} allPkgs={LIST} onClose={() => {}} onSaved={onSaved} /></ToastProvider>)
    expect(screen.getByText('Tạo phiên bản mới của PT 10 buổi')).toBeTruthy()
    expect(screen.getByText(/Gói cũ và các hợp đồng đã bán giữ nguyên/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Giá (đ)'), { target: { value: '3300000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên bản' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(h.post).toHaveBeenCalledWith('/packages', expect.objectContaining({ replaces_id: 'pt1', deactivate_replaced: true, bundled_member_package_id: 'm1', price: 3300000, branch_id: 'b1' }))
  })
  it('maps PACKAGE_IN_USE to a clear message', async () => {
    h.patch.mockRejectedValue({ response: { status: 409, data: { error: { code: 'PACKAGE_IN_USE', message: 'x' } } } })
    render(<ToastProvider><PackageModal target={{ mode: 'edit', pkg: M }} allPkgs={LIST} onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Giá (đ)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(await screen.findByText('Gói đã có hợp đồng nên không sửa được. Hãy tạo phiên bản mới.')).toBeTruthy()
    expect(h.patch).toHaveBeenCalledWith('/packages/m1', { price: 1 })
  })
})

describe('bundle UI', () => {
  it('wizard info block with and without included package, with extension', () => {
    const { rerender } = render(<BundleInfo pkg={LIST[2]} runningEnd="2026-12-31" />)
    expect(screen.getByText(/Gói member đi kèm: Gói 1 tháng \(30 ngày\)\. Hệ thống tự gán cho khách khi tạo hợp đồng\./)).toBeTruthy()
    expect(screen.getByText('Sẽ nối tiếp sau khi gói member hiện tại hết hạn ngày 31/12/2026.')).toBeTruthy()
    rerender(<BundleInfo pkg={LIST[3]} runningEnd={null} />)
    expect(screen.getByText('Gói PT này chưa gắn gói member; khách cần có gói member riêng để check-in.')).toBeTruthy()
  })
  it('contract detail panel and banner', () => {
    const b = { id: 'c2', code: 'HD00002', status: 'active' as const, start_date: '2026-11-01', end_date: '2026-12-01', package: { id: 'm1', name: 'Gói 1 tháng', type: 'month' as const, category: 'member' as const } }
    render(<MemoryRouter><BundleSection c={{ bundled_contracts: [b], bundle_of_id: null }} /><BundleSection c={{ bundle_of_id: 'c1' }} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Gói member đi kèm' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'HD00002' }).getAttribute('href')).toBe('/contracts/c2')
    expect(screen.getByText(/Hợp đồng này đi kèm gói PT/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Xem hợp đồng gói PT' }).getAttribute('href')).toBe('/contracts/c1')
  })
})

describe('copy mode', () => {
  it('copy sends neither replaces_id nor deactivate_replaced', async () => {
    h.post.mockClear()
    const onSaved = vi.fn()
    render(<ToastProvider><PackageModal target={{ mode: 'version', pkg: M }} allPkgs={LIST} onClose={() => {}} onSaved={onSaved} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Chỉ sao chép (giữ cả hai gói đang bán)'))
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên bản' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = h.post.mock.calls[0][1]
    expect(body).not.toHaveProperty('replaces_id')
    expect(body).not.toHaveProperty('deactivate_replaced')
    expect(body.name).toBe('Gói 1 tháng')
  })
})
