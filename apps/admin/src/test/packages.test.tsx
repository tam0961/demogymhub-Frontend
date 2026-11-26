import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../components/Toast'
import { groupPackages, changedFields, termText } from '../lib/packages'
import type { Pkg } from '../types'

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
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
  h.delete.mockReset().mockResolvedValue({ data: { data: {} } })
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
    expect(termText(pkg({ type: 'session', sessions: 10, duration_days: 60 }))).toBe('10 buổi / 60 ngày')
    const f = { name: 'Gói 1 tháng', category: 'member' as const, type: 'month' as const, duration_days: 30, sessions: null, price: 700000, vat_percent: 8, bundled_member_package_id: '' }
    expect(changedFields(M, f)).toEqual({ price: 700000 })
  })
})

describe('Packages page', () => {
  it('renders 4 boxes in order with counts', async () => {
    page()
    await screen.findByText('PT 10 buổi')
    const heads = screen.getAllByRole('heading', { level: 2 }).map((x) => x.firstChild?.textContent ?? '')
    expect(heads).toEqual(['Gói member', 'PT 1:1', 'PT 1:2', 'PT nhóm'])
    expect(screen.getAllByRole('heading', { level: 2 })[0].textContent).toMatch(/\d+ gói$/)
    expect(screen.getByText('Chưa gắn')).toBeTruthy()
    expect(screen.getByText('Phiên bản mới')).toBeTruthy()
  })
  it('inactive toggle shows muted packages', async () => {
    page()
    await screen.findAllByText('Gói 1 tháng')
    expect(screen.queryByText('Gói cũ')).toBeNull()
    fireEvent.click(screen.getByLabelText('Hiện gói đã vô hiệu hóa'))
    expect(screen.getByText('Gói cũ')).toBeTruthy()
  })
  it('rows only offer Sửa and Xóa', async () => {
    page()
    await screen.findByText('PT 10 buổi')
    const row = screen.getByText('PT 10 buổi').closest('tr') as HTMLElement
    const names = within(row).getAllByRole('button').map((x) => x.textContent)
    expect(names).toEqual(['Sửa', 'Xóa'])
  })
  it('Xóa confirms then deletes', async () => {
    page()
    await screen.findAllByText('Gói 1 tháng')
    const row = screen.getAllByText('Gói 1 tháng')[0].closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Xóa' }))
    const dlg = screen.getByRole('dialog')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Xóa gói' }))
    await waitFor(() => expect(h.delete).toHaveBeenCalledWith('/packages/m1'))
  })
  it('Sửa asks to save as a new package and deactivates the old one', async () => {
    const onSaved = vi.fn()
    render(<ToastProvider><PackageModal target={{ mode: 'edit', pkg: LIST[2] }} allPkgs={LIST} onClose={() => {}} onSaved={onSaved} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Giá (đ)'), { target: { value: '3300000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(screen.getByText(/lưu thành gói mới và vô hiệu hóa gói cũ/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lưu thành gói mới?' })).getByRole('button', { name: 'Xác nhận' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(h.post).toHaveBeenCalledWith('/packages', expect.objectContaining({ replaces_id: 'pt1', deactivate_replaced: true, bundled_member_package_id: 'm1', price: 3300000, branch_id: 'b1' }))
  })
  it('Sửa can update the current package in place', async () => {
    const onSaved = vi.fn()
    render(<ToastProvider><PackageModal target={{ mode: 'edit', pkg: M }} allPkgs={LIST} onClose={() => {}} onSaved={onSaved} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Giá (đ)'), { target: { value: '800000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lưu thành gói mới?' })).getByRole('button', { name: 'Cập nhật vào gói hiện tại' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('update'))
    expect(h.patch).toHaveBeenCalledWith('/packages/m1', expect.objectContaining({ price: 800000 }))
    expect(h.post).not.toHaveBeenCalled()
  })
  it('promotion needs a value and an end date', async () => {
    render(<ToastProvider><PackageModal target={{ mode: 'edit', pkg: LIST[0] }} allPkgs={LIST} onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Khuyến mãi'), { target: { value: 'bonus_months' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    expect(screen.getByText('Hãy nhập giá trị khuyến mãi')).toBeTruthy()
  })
  it('maps PACKAGE_IN_USE to a clear message', async () => {
    h.post.mockRejectedValue({ response: { status: 409, data: { error: { code: 'PACKAGE_IN_USE', message: 'x' } } } })
    render(<ToastProvider><PackageModal target={{ mode: 'edit', pkg: M }} allPkgs={LIST} onClose={() => {}} onSaved={() => {}} /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Giá (đ)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lưu thành gói mới?' })).getByRole('button', { name: 'Xác nhận' }))
    expect(await screen.findByText('Gói đã có hợp đồng nên không sửa được. Hãy tạo phiên bản mới.')).toBeTruthy()
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
    render(<MemoryRouter><BundleSection c={{ bundle_of_id: 'c1' }} /></MemoryRouter>)
    expect(screen.getByText(/Hợp đồng này đi kèm gói PT/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Xem hợp đồng gói PT' }).getAttribute('href')).toBe('/contracts/c1')
  })
})

describe('HSD note only for PT 1:1', () => {
  it('no HSD column, rule note only in the PT 1:1 box', async () => {
    page()
    await screen.findByText('PT 10 buổi')
    expect(screen.queryAllByRole('columnheader', { name: /^HSD/ })).toHaveLength(0)
    expect(screen.getAllByText(/Chỉ áp dụng cho gói PT 1:1/)).toHaveLength(1)
    expect(screen.queryByText(/Dùng thêm/)).toBeNull()
  })
})
